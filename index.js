const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const pino = require('pino')
const readline = require('readline')

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session')
    const { version } = await fetchLatestBaileysVersion()
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        version
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update
        if (connection === 'close') {
            if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                startBot()
            } else {
                console.log("❌ Bot logged out")
            }
        } else if (connection === 'open') {
            console.log('✅ Bot WhatsApp aktif!')
        } else if (update.pairingCode) {
            console.log(`🔗 Pairing Code: ${update.pairingCode}`)
        }
    })

    // Kalau belum login, minta pairing code
    if (!state.creds.registered) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        rl.question('Masukkan nomor WhatsApp (contoh: 628xxx): ', async (number) => {
            const code = await sock.requestPairingCode(number)
            console.log('🔗 Pairing Code:', code)
            rl.close()
        })
    }

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''

        if (text.toLowerCase() === 'ping') {
            await sock.sendMessage(from, { text: 'Pong!' })
        }
    })
}

startBot()