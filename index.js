const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const pino = require('pino')
const readline = require('readline')
const fs = require('fs')
const fetch = require('node-fetch')

const ownerNumber = '6285893973177'
const botName = 'MyBot' 
const selfMode = true 
const antiSpam = {} 

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session')
    const { version } = await fetchLatestBaileysVersion()
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        version
    })

    const contacts = []
    let textpushkontak = ''

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
        const sender = msg.key.participant || msg.key.remoteJid
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
        const command = text.toLowerCase().split(' ')[0]
        const args = text.split(' ').slice(1)
        const q = args.join(' ')
        const isBot = sender === sock.user.id

        const isOwner = sender.includes(ownerNumber)
        const reply = async (message) => {
            await sock.sendMessage(from, { text: message })
        }

        if (selfMode && !isBot && !isOwner) {
            return 
        }

        if (antiSpam[sender] && Date.now() - antiSpam[sender] < 3000) {
            return
        }
        antiSpam[sender] = Date.now()

        switch(command) {
            case 'ping':
                await reply('Pong!')
                break;

            case 'menu':
                const menuText = `🤖 *MENU BOT* 🤖\n\n` +
                                `• *ping* - Cek bot aktif\n` +
                                `• *menu* - Tampilkan menu\n` +
                                `• *ceknik* [nik] - Cek info NIK\n` +
                                `• *lacakip* [ip] - Lacak info IP\n` +
                                `• *savekontak* - Simpan kontak grup\n` +
                                `${isOwner ? '• *pushkontak* [pesan] - Kirim pesan ke grup (Owner)\n' : ''}` +
                                `• *time* - Waktu sekarang`
                await reply(menuText)
                break;

            case 'ceknik':
                if (!q) return reply(`Contoh penggunaan: ceknik 99101xxxxx`)
                
                try {
                    const { nikParser } = require('nik-parser')
                    const nik = nikParser(q)

                    if (!nik.isValid()) return reply('NIK tidak valid!')

                    const provinsi = nik.province()
                    const kabupaten = nik.kabupatenKota()
                    const kecamatan = nik.kecamatan()
                    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(kecamatan + ', ' + kabupaten + ', ' + provinsi)}`

                    const infoNik = `🔍 *INFO NIK* 🔍\n\n` +
                                    `NIK: ${q}\n` +
                                    `Valid: ${nik.isValid() ? '✅' : '❌'}\n` +
                                    `Provinsi: ${provinsi}\n` +
                                    `Kabupaten: ${kabupaten}\n` +
                                    `Kecamatan: ${kecamatan}\n` +
                                    `Kode Pos: ${nik.kodepos()}\n` +
                                    `Jenis Kelamin: ${nik.kelamin()}\n` +
                                    `Tanggal Lahir: ${nik.lahir()}\n\n` +
                                    `📍 *Lokasi di Maps:*\n${mapsUrl}`

                    await reply(infoNik)
                } catch (error) {
                    await reply('Gagal memproses NIK. Pastikan format NIK benar!')
                }
                break;

            case 'lacakip': case 'trackip':
                if (!q) return reply(`Contoh penggunaan: lacakip 101.000.181`)
                
                try {
                    const res = await fetch(`https://ipwho.is/${q}`).then(r => r.json())
                    
                    if (!res.success) throw new Error('IP tidak ditemukan')

                    const formatIPInfo = `🌐 *INFO IP* 🌐\n\n` +
                                        `• IP: ${res.ip}\n` +
                                        `• Negara: ${res.country} (${res.country_code})\n` +
                                        `• Kota: ${res.city}\n` +
                                        `• Region: ${res.region}\n` +
                                        `• Kode Pos: ${res.postal}\n` +
                                        `• Latitude: ${res.latitude}\n` +
                                        `• Longitude: ${res.longitude}\n` +
                                        `• ISP: ${res.connection?.isp || 'Tidak diketahui'}\n` +
                                        `• Zona Waktu: ${res.timezone?.id}\n` +
                                        `• Waktu Sekarang: ${res.timezone?.current_time}`

                    // Kirim lokasi di maps
                    await sock.sendMessage(from, { 
                        location: { 
                            degreesLatitude: res.latitude, 
                            degreesLongitude: res.longitude 
                        }
                    })

                    await reply(formatIPInfo)
                } catch (error) {
                    await reply(`Gagal melacak IP: ${error.message}`)
                }
                break;

            case 'savekontak': case 'savecontact':
                if (!msg.key.remoteJid.endsWith('@g.us')) return reply('❌ Command ini hanya bisa digunakan di grup!')
                
                try {
                    const groupMetadata = await sock.groupMetadata(from)
                    const participants = groupMetadata.participants
                        .filter(v => v.id.endsWith('.net'))
                        .map(v => v.id)
                    
                    // Buat file VCF
                    const uniqueContacts = [...new Set(participants)]
                    const vcardContent = uniqueContacts.map((contact, index) => {
                        return [
                            "BEGIN:VCARD",
                            "VERSION:3.0",
                            `FN:Kontak Grup - ${contact.split("@")[0]}`,
                            `TEL;type=CELL;type=VOICE;waid=${contact.split("@")[0]}:+${contact.split("@")[0]}`,
                            "END:VCARD",
                            ""
                        ].join("\n")
                    }).join("")

                    // Simpan file sementara
                    const path = './temp_contacts.vcf'
                    fs.writeFileSync(path, vcardContent, "utf8")

                    // Kirim file ke pengguna
                    await sock.sendMessage(from, { 
                        document: fs.readFileSync(path),
                        fileName: "kontak_grup.vcf",
                        caption: `📇 *Daftar Kontak Grup*\n\nTotal ${uniqueContacts.length} kontak`,
                        mimetype: "text/vcard"
                    })

                    // Hapus file sementara
                    fs.unlinkSync(path)
                    
                } catch (error) {
                    console.error(error)
                    await reply('❌ Gagal membuat daftar kontak: ' + error.message)
                }
                break;

            case 'pushkontak':
                if (!isOwner) return reply('❌ Command ini hanya bisa digunakan oleh owner bot!')
                
                if (!q) return reply(`Contoh penggunaan: pushkontak Pesan yang ingin dikirim`)
                
                try {
                    textpushkontak = q
                    
                    // Ambil semua grup yang diikuti bot
                    const meta = await sock.groupFetchAllParticipating()
                    const groupIds = Object.keys(meta)
                    
                    // Buat list pilihan grup
                    const groupList = groupIds.map(groupId => ({
                        title: meta[groupId].subject,
                        id: `respushkontak ${groupId}`,
                        description: `${meta[groupId].participants.length} Anggota`
                    }))
                    
                    // Kirim tombol pilihan grup
                    await sock.sendMessage(from, {
                        text: "📢 *PUSH KONTROL*\n\nPilih grup tujuan untuk mengirim pesan:",
                        footer: `© ${new Date().getFullYear()} ${botName}`,
                        buttons: [{
                            buttonId: 'action',
                            buttonText: { displayText: 'Pilih Grup' },
                            type: 4,
                            nativeFlowInfo: {
                                name: 'single_select',
                                paramsJson: JSON.stringify({
                                    title: 'Daftar Grup',
                                    sections: [{
                                        title: 'Grup yang Tersedia',
                                        rows: groupList
                                    }]
                                })
                            }
                        }],
                        headerType: 1,
                        contextInfo: {
                            mentionedJid: [sender, ownerNumber + '@s.whatsapp.net']
                        }
                    })
                    
                } catch (error) {
                    console.error('Error pushkontak:', error)
                    await reply('❌ Gagal memproses command pushkontak: ' + error.message)
                }
                break;

            case 'respushkontak':
                if (!isOwner) return reply('Akses ditolak!')
                
                const groupId = args[0]
                
                try {
                    await sock.sendMessage(groupId, { text: textpushkontak })
                    await reply(`✅ Pesan berhasil dikirim ke grup!`)
                } catch (error) {
                    await reply(`❌ Gagal mengirim pesan: ${error.message}`)
                }
                break;

            default:
                // Tidak merespon command tidak dikenal jika bukan bot/owner
                if (text && (isBot || isOwner || !selfMode)) {
                    await reply('Command tidak dikenali. Ketik *menu* untuk melihat daftar command.')
                }
        }
    })
}

startBot()