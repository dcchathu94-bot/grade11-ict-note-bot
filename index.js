require('dotenv').config();

// 🇱🇰 Timezone එක ලංකාවේ වෙලාවට සැකසීම
process.env.TZ = 'Asia/Colombo';

const http = require('http');
const PORT = process.env.PORT || 3000;

// 🚀 Render Web Service එක Active තබා ගැනීමට HTTP Server එක
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Grade 10 & 11 ICT Textbook Short Note Bot is Live 24/7!\n');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Server is live on port ${PORT}`);
});

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const admin = require('firebase-admin');

// 🔥 Firebase Admin Initialize කිරීම
let firebaseCreds;
try {
    firebaseCreds = JSON.parse(process.env.FIREBASE_CREDENTIALS);
} catch (error) {
    console.error("⚠️ Firebase Credentials දෝෂයක්! FIREBASE_CREDENTIALS පරීක්ෂා කරන්න.");
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(firebaseCreds),
        databaseURL: process.env.FIREBASE_DB_URL
    });
}

const db = admin.database();
const noteHistoryRef = db.ref('grade11_note_history');

async function appendToNoteHistory(data) {
    try {
        const timeString = new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' });
        const entry = {
            timestamp: timeString,
            grade: data.grade || 'Grade 10/11',
            unit: data.unit,
            topic: data.topic,
            content: data.content,
            keyPoints: data.keyPoints
        };
        await noteHistoryRef.push(entry);
        console.log('💾 සටහන Firebase History එකට සාර්ථකව සේව් වුණා!');
    } catch (e) {
        console.error('Firebase History Save Error:', e.message);
    }
}

let cronStarted = false; 
let activeSock = null;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_grade11');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    activeSock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n--- අලුත් QR එක Scan කරන්න ---');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`Connection closed (status: ${statusCode}), reconnecting... ${shouldReconnect}`);
            
            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ ICT Short Note Bot (Textbook Grounded) සාර්ථකව සම්බන්ධ විය!');
            
            if (!cronStarted) {
                cronStarted = true;
                // උදේ 8.00 සහ සවස 4.00 ට
                cron.schedule('0 8,16 * * *', () => {
                    console.log('⏰ නියමිත වෙලාව පැමිණ ඇත. Short Note එක සකසමින් පවතී...');
                    sendDailyShortNote(activeSock);
                }, {
                    scheduled: true,
                    timezone: "Asia/Colombo"
                });
                
                console.log('⏰ ටයිමර් පද්ධතිය සාර්ථකව ක්‍රියාත්මකයි (8:00 AM, 4:00 PM).');
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;
        
        const messageText = m.message.conversation || m.message.extendedTextMessage?.text;
        const chatJid = m.key.remoteJid;

        if (messageText === '!jid') {
            await sock.sendMessage(chatJid, { text: `📌 මෙම චැට් එකේ JID එක මෙන්න:\n\n\`${chatJid}\`` });
        }

        if (messageText === '!testnote') {
            await sock.sendMessage(chatJid, { text: '🔄 ටෙස්ට් කිරීම ආරම්භ විය. පෙළපොත් ඇසුරෙන් Short Note එක සකසමින් පවතී...' });
            sendDailyShortNote(activeSock); 
        }

        if (messageText === '!notehistory') {
            try {
                const snapshot = await noteHistoryRef.once('value');
                const historyData = snapshot.val();
                
                if (historyData) {
                    let textContent = "📚 මෙතෙක් යවන ලද ICT කෙටි සටහන් එකතුව (10 & 11 පෙළපොත් ඇසුරෙන්)\n\n";
                    
                    Object.values(historyData).forEach(data => {
                        textContent += `==================================================\n` +
                                       `📅 දිනය: ${data.timestamp}\n` +
                                       `📖 පාඩම: ${data.unit} (${data.grade || 'O/L'})\n` +
                                       `📌 මාතෘකාව: ${data.topic}\n\n` +
                                       `📝 සටහන:\n${data.content}\n\n` +
                                       `💡 විභාගයට වැදගත් කරුණු:\n${(data.keyPoints || []).join('\n')}\n` +
                                       `==================================================\n\n`;
                    });

                    await sock.sendMessage(chatJid, {
                        document: Buffer.from(textContent, 'utf-8'),
                        mimetype: 'text/plain',
                        fileName: 'Grade_10_11_ICT_Short_Notes.txt',
                        caption: '📚 මෙතෙක් යවන ලද සියලුම 10 සහ 11 වසර ICT කෙටි සටහන් එකතුව මෙන්න!'
                    });
                } else {
                    await sock.sendMessage(chatJid, { text: '⚠️ තවමත් කිසිදු සටහනක් History එකට සේව් වී නොමැත.' });
                }
            } catch (err) {
                console.error('History command error:', err.message);
                await sock.sendMessage(chatJid, { text: '⚠️ History දත්ත ලබා ගැනීමේදී දෝෂයක් ඇතිවිය.' });
            }
        }
    });
}

// 📖 අමුණන ලද 10 සහ 11 පෙළපොත් PDF දෙක ඇසුරෙන් පමණක් Short Note එක සෑදීම
async function generateShortNoteFromGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

    const historySnapshot = await noteHistoryRef.once('value');
    const historyData = historySnapshot.val();
    
    let previousTopics = [];
    if (historyData) {
        previousTopics = Object.values(historyData).map(item => item.topic);
    }

    const excludedTopicsText = previousTopics.length > 0 
        ? `දැනටමත් සකසා ඇති මෙම මාතෘකා නැවත භාවිත නොකරන්න: ${JSON.stringify(previousTopics.slice(-60))}` 
        : '';

    const promptText = `ඔබ ශ්‍රී ලංකා ජාතික අධ්‍යාපන ආයතනයේ (NIE) 10 සහ 11 ශ්‍රේණි ICT නිල පෙළපොත් පමණක් පරිශීලනය කරන ප්‍රවීණ ගුරුවරයෙකි.

අමුණා ඇති 10 සහ 11 ශ්‍රේණි පෙළපොත් PDF ලේඛන දෙකේ (Attached Files) අන්තර්ගතය පමණක් දැඩිව පදනම් කරගෙන, සාමාන්‍ය පෙළ (O/L) විභාගයට අතිශය වැදගත් කෙටි සටහනක් (Revision Short Note) පිරිසිදු සිංහලෙන් සකසන්න.

⛔ අතිශය වැදගත් නීති (Strict Rules):
1. පෙළපොතේ පිටුවල ඇති කරුණු සහ නිල සිංහල තාක්ෂණික වචනම පමණක් යොදාගන්න.
2. පෙළපොතෙන් පිට කිසිදු බාහිර දැනුමක් (A/L ICT, Python, Java) ඇතුළත් නොකරන්න.
3. ${excludedTopicsText}

Return STRICTLY in JSON format:
{
  "grade": "10 ශ්‍රේණිය හෝ 11 ශ්‍රේණිය",
  "unit": "පෙළපොතේ ඇති පාඩමේ නම",
  "topic": "උප මාතෘකාව",
  "content": "පෙළපොත ඇසුරෙන් පමණක් කෙටි, නිවැරදි සටහන (Clear paragraph with textbook terms)",
  "keyPoints": [
    "🔹 විභාගයට වැදගත් කරුණ 1",
    "🔹 විභාගයට වැදගත් කරුණ 2",
    "🔹 විභාගයට වැදගත් කරුණ 3"
  ]
}`;

    // 📎 පෙළපොත් දෙකේ URIs කෙලින්ම Gemini Input එකට සම්බන්ධ කිරීම
    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        fileData: {
                            mimeType: "application/pdf",
                            fileUri: "https://generativelanguage.googleapis.com/v1beta/files/x7clqnazq98o" // 10 ශ්‍රේණිය පෙළපොත
                        }
                    },
                    {
                        fileData: {
                            mimeType: "application/pdf",
                            fileUri: "https://generativelanguage.googleapis.com/v1beta/files/he8on2exgrfx" // 11 ශ්‍රේණිය පෙළපොත
                        }
                    },
                    {
                        text: promptText
                    }
                ]
            }
        ],
        generationConfig: { 
            responseMimeType: "application/json", 
            temperature: 0.2 // පෙළපොතේ තොරතුරු වලට පමණක් දැඩිව සීමා කිරීමට
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    const result = await response.json();

    if (!result.candidates || !result.candidates[0]?.content?.parts?.[0]?.text) {
        console.error('Gemini API Response Error:', JSON.stringify(result));
        throw new Error('Gemini API එකෙන් දත්ත ලැබුණේ නැත.');
    }

    const rawJSON = result.candidates[0].content.parts[0].text;
    const jsonMatch = rawJSON.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('වලංගු JSON එකක් ලැබුණේ නැත.');
    }
    
    return JSON.parse(jsonMatch[0]);
}

async function sendDailyShortNote(sock, retryCount = 0) {
    const MAX_RETRIES = 3;
    
    try {
        console.log('Gemini AI මඟින් පෙළපොත් කියවා කෙටි සටහන සකසමින් පවතී...');
        
        const noteData = await generateShortNoteFromGemini();

        const targetGroups = [
            '120363429635141660@g.us', // ඔයාගේ WhatsApp Group JID එක
        ];

        const messageText = 
`📌 *G.C.E. O/L ICT - Quick Revision* (${noteData.grade || 'Grade 10/11'})
━━━━━━━━━━━━━━━━━━━━━
📖 *පාඩම:* ${noteData.unit}
🎯 *මාතෘකාව:* ${noteData.topic}
━━━━━━━━━━━━━━━━━━━━━

📝 *කෙටි සටහන:*
${noteData.content}

💡 *විභාගයට වැදගත් විශේෂ කරුණු:*
${(noteData.keyPoints || []).join('\n')}

━━━━━━━━━━━━━━━━━━━━━
_දිනපතා කෙටි සටහන් ලබා ගැනීමට සම්බන්ධ වී සිටින්න._
👨‍🏫 *ICT with Dhanush Pathirana*`;

        for (const targetJid of targetGroups) {
            await sock.sendMessage(targetJid, { text: messageText });
        }
        
        console.log('✅ සියලුම ගෲප් වෙත කෙටි සටහන සාර්ථකව යැව්වා!');
        await appendToNoteHistory(noteData);

    } catch (error) {
        console.error(`⚠️ දෝෂයක් ඇතිවිය (${retryCount + 1}/${MAX_RETRIES}):`, error.message);
        
        if (retryCount < MAX_RETRIES) {
            setTimeout(() => {
                console.log('🔄 නැවත උත්සාහ කරමින්...');
                sendDailyShortNote(sock, retryCount + 1);
            }, 30000);
        } else {
            console.error('❌ උපරිම උත්සාහයන් සංඛ්‍යාව පසුවිය.');
        }
    }
}

connectToWhatsApp();
