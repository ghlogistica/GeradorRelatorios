let createCanvas, registerFont;
try {
  const canvas = require('canvas');
  createCanvas = canvas.createCanvas;
  registerFont = canvas.registerFont;
} catch (e) {
  console.warn('Modulo canvas não instalado. ZebraPrinterService poderá não funcionar corretamente.');
}
const net = require('net');

/**
 * Serviço de Integração para Impressoras Zebra.
 * Gera etiquetas utilizando fontes TrueType customizadas convertendo um Canvas 
 * em uma Imagem Monocromática e, em seguida, num comando ZPL ^GF (Graphic Field).
 */
class ZebraPrinterService {

    /**
     * Você pode precisar registrar as fontes do sistema Linux (ex: Ubuntu)
     * registerFont('/usr/share/fonts/truetype/msttcorefonts/Arial.ttf', { family: 'Arial' });
     */

    /**
     * Imprime a etiqueta em uma impressora Zebra via Raw Socket.
     * 
     * @param {string} printerIp - Endereço IP da impressora Zebra na rede local.
     * @param {Object} configuracao - Configurações de dimensão (width, height) em pixels/dots.
     * @param {Array} elementos - Array de elementos do layout {tipo, x, y, texto, fonte, tamanho}.
     * @param {Object} dados_banco - Objeto chave/valor com os dados processados do Banco de Dados.
     * @returns {Promise<string>} Resultado da operação.
     */
    async imprimirEtiqueta(printerIp, configuracao, elementos, dados_banco) {
        // Dimensões do Canvas baseadas nos "dots" da impressora (ex: 203dpi = 8 dots por mm).
        const width = configuracao.width || 800; // ~ 10cm a 203dpi
        const height = configuracao.height || 1200; // ~ 15cm a 203dpi

        // 1. Instanciar o Canvas em memória (node-canvas)
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Preenche o fundo com branco
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#000000'; // Cor da tinta (preto) para desenhar

        // 2. Desenhar os Elementos (Textos) com fontes customizadas (Arial, Calibri)
        elementos.forEach(el => {
            const textoReal = el.isStatic ? el.valor_ou_coluna : dados_banco[el.valor_ou_coluna] || '';
            
            if (el.tipo_elemento === 'texto') {
                ctx.font = `${el.tamanho_fonte}px "${el.fonte || 'Arial'}"`;
                // Posiciona o texto nas coordenadas informadas
                ctx.fillText(textoReal, el.posicao_x, el.posicao_y);
            } 
            // Obs: Se for código de barras ou qrcode, há bibliotecas como 'bwip-js' para renderizar 
            // no canvas antes de converter, ou podemos enviar os comandos nativos ZPL misturados.
        });

        // 3. Extrair os pixels e converter para Monocromático 1-Bit e depois para Hex (ZPL ^GF)
        const imageData = ctx.getImageData(0, 0, width, height);
        const zplGraphicHex = this._convertRgbaToZplHex(imageData.data, width, height);

        // O comando ^GFA (Graphic Field ASCII)
        // ^GFA,total_bytes,total_bytes,bytes_per_row,dados_hexa
        const bytesPerRow = Math.ceil(width / 8);
        const totalBytes = bytesPerRow * height;

        const zplCommand = `^XA\n^FO0,0\n^GFA,${totalBytes},${totalBytes},${bytesPerRow},${zplGraphicHex}\n^XZ`;

        // 4. Enviar a string ZPL via TCP/IP na porta 9100
        return this._sendRawZplToPrinter(printerIp, zplCommand);
    }

    /**
     * Converte o array de pixels RGBA do Canvas (onde cada pixel ocupa 4 posições) 
     * em uma string Hexadecimal empacotando 8 pixels de 1-bit por Byte, como exigido pela Zebra.
     */
    _convertRgbaToZplHex(rgbaData, width, height) {
        let hexString = '';
        const bytesPerRow = Math.ceil(width / 8);

        for (let y = 0; y < height; y++) {
            for (let byteIndex = 0; byteIndex < bytesPerRow; byteIndex++) {
                let currentByte = 0;

                // Lê os 8 pixels referentes a este Byte
                for (let bit = 0; bit < 8; bit++) {
                    const x = (byteIndex * 8) + bit;
                    
                    if (x < width) {
                        // O array rgbaData guarda (R,G,B,A) para cada pixel
                        const pixelIndex = (y * width + x) * 4;
                        const r = rgbaData[pixelIndex];
                        const g = rgbaData[pixelIndex + 1];
                        const b = rgbaData[pixelIndex + 2];
                        const alpha = rgbaData[pixelIndex + 3];

                        // Calcula a luminância aproximada para aplicar um "Threshold"
                        // Fundo é branco (255) e texto é preto (0). Se a luminância for baixa e opaco, pintamos o ponto.
                        const isDark = (r + g + b) / 3 < 128 && alpha > 128;

                        if (isDark) {
                            // Liga o bit correspondente (Zebra considera 1 como preto)
                            // Bits são preenchidos da esquerda para a direita (MSB para LSB)
                            currentByte |= (1 << (7 - bit));
                        }
                    }
                }
                
                // Converte o byte numérico (ex: 255) para Hexadecimal de 2 dígitos (ex: "FF")
                const hexValue = currentByte.toString(16).toUpperCase().padStart(2, '0');
                hexString += hexValue;
            }
            hexString += '\n'; // Quebra de linha ajuda na leitura (opcional na Zebra)
        }

        return hexString;
    }

    /**
     * Abre um Raw Socket TCP na porta 9100 e escreve os bytes do comando ZPL.
     */
    _sendRawZplToPrinter(ip, zplString) {
        return new Promise((resolve, reject) => {
            const PORT = 9100;
            const client = new net.Socket();
            let hasError = false;

            // Timeout de 5 segundos
            client.setTimeout(5000);

            client.connect(PORT, ip, () => {
                console.log(`[ZebraPrinter] Conectado na impressora ${ip}:${PORT}`);
                
                // Envia a string (encode default utf-8, mas ZPL hex é ASCII)
                client.write(zplString, 'utf8', () => {
                    console.log(`[ZebraPrinter] ZPL impresso com sucesso!`);
                    client.end(); // Fecha a conexão de forma limpa
                });
            });

            client.on('error', (err) => {
                console.error(`[ZebraPrinter] Erro de Socket:`, err.message);
                hasError = true;
                client.destroy();
                reject(new Error(`Falha de rede ao conectar na Zebra (${ip}): ${err.message}`));
            });

            client.on('timeout', () => {
                console.error(`[ZebraPrinter] Conexão com ${ip} sofreu Timeout!`);
                hasError = true;
                client.destroy(); // Destrói o socket para não ficar travado
                reject(new Error('Timeout: Impressora Offline ou não alcançável.'));
            });

            client.on('close', () => {
                if (!hasError) {
                    resolve('Impressão enviada com sucesso');
                }
            });
        });
    }
}

module.exports = new ZebraPrinterService();
