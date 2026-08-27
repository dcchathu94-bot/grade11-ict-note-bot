require('dotenv').config();

// 🇱🇰 Timezone එක ලංකාවේ වෙලාවට සැකසීම
process.env.TZ = 'Asia/Colombo';

const http = require('http');
const PORT = process.env.PORT || 3000;

// 🚀 Render Web Service එක Active තබා ගැනීමට HTTP Server එක
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Grade 10 & 11 ICT Strict Syllabus Bot is Live 24/7!\n');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Server is live on port ${PORT}`);
});

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
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
        printQRInTerminal: false,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000
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
            } else {
                console.log('❌ WhatsApp වෙතින් Log Out වී ඇත.');
            }
        } else if (connection === 'open') {
            console.log('✅ ICT Short Note Bot සාර්ථකව සම්බන්ධ විය!');
            
            if (!cronStarted) {
                cronStarted = true;
                cron.schedule('0 8,16 * * *', () => {
                    console.log('⏰ නියමිත වෙලාව පැමිණ ඇත. Short Note එක සකසමින් පවතී...');
                    sendDailyShortNote(activeSock);
                }, {
                    scheduled: true,
                    timezone: "Asia/Colombo"
                });
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
            await sock.sendMessage(chatJid, { text: '🔄 ටෙස්ට් කිරීම ආරම්භ විය. නිල පෙළපොත් විෂය නිර්දේශය ඇසුරෙන් සටහන සකසමින් පවතී...' });
            sendDailyShortNote(activeSock); 
        }

        if (messageText === '!notehistory') {
            try {
                const snapshot = await noteHistoryRef.once('value');
                const historyData = snapshot.val();
                
                if (historyData) {
                    let textContent = "📚 මෙතෙක් යවන ලද ICT කෙටි සටහන් එකතුව (10 & 11 නිල පෙළපොත් ඇසුරෙන්)\n\n";
                    
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
            }
        }
    });
}

// 📖 ශ්‍රී ලංකා 10 සහ 11 ICT නිල විෂය නිර්දේශය පමණක් භාවිත කරමින් කෙටි සටහන සෑදීම
async function generateShortNoteFromGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const historySnapshot = await noteHistoryRef.once('value');
    const historyData = historySnapshot.val();
    
    let previousTopics = [];
    if (historyData) {
        previousTopics = Object.values(historyData).map(item => item.topic);
    }

    const excludedTopicsText = previousTopics.length > 0 
        ? `දැනටමත් සකසා ඇති මෙම මාතෘකා නැවත කිසිසේත් භාවිත නොකරන්න: ${JSON.stringify(previousTopics.slice(-60))}` 
        : '';

    const promptText = `ඔබ ශ්‍රී ලංකා අධ්‍යාපන ප්‍රකාශන දෙපාර්තමේන්තුවේ 10 සහ 11 ශ්‍රේණි ICT නිල පෙළපොත් පමණක් උගන්වන ප්‍රවීණ ගුරුවරයෙකි.

පහත දක්වා ඇති නිල විෂය නිර්දේශයේ (Official Syllabus Blueprint) පාඩම් සහ මාතෘකා පමණක් දැඩිව පදනම් කරගෙන සාමාන්‍ය පෙළ (O/L) විභාගයට අදාළ කෙටි සටහනක් සකසන්න:

📘 **10 ශ්‍රේණිය නිල පාඩම්:**
1. තොරතුරු හා සන්නිවේදන තාක්ෂණයේ සංකල්ප (දත්ත, තොරතුරු, පරිගණක පද්ධතිය, ගුණාංග)
2. පරිගණකයේ දෘඩාංග (ආදාන, ප්‍රතිදාන, සැකසුම්, මතක උපාංග, වරාය)
3. දත්ත නිරූපණය (ද්විමය, අෂ්ටමය, ෂඩ්දශමය, ASCII, Unicode, BCD)
4. මූලික තාර්කික ද්වාර (AND, OR, NOT, NAND, NOR, सत्यතා වගු)
5. මෙහෙයුම් පද්ධති (GUI, CLI, කාර්යයන්, ගොනු කළමනාකරණය)
6. වදන් සැකසුම් මෘදුකාංග (Word Processing)
7. පැතුරුම්පත් මෘදුකාංග (Spreadsheets - Functions & Formulas)
8. විද්‍යුත් ඉදිරිපත් කිරීම් (Electronic Presentations)
9. පරිගණක දත්ත සමුදාය (Databases - Tables, Forms, Queries, Reports)

📙 **11 ශ්‍රේණිය නිල පාඩම්:**
1. පරිගණක ක්‍රමලේඛනය (Flowcharts, Pseudocode, Pascal ක්‍රමලේඛනය පමණි - Python/Java සම්පූර්ණයෙන්ම තහනම්)
2. අන්තර්ජාලය සහ විද්‍යුත් තැපෑල (IP ලිපින, Domain Names, Search Engines, Protocols)
3. බහුමාධ්‍ය තාක්ෂණය (Multimedia - ශ්‍රව්‍ය, දෘශ්‍ය, රූප ආකෘති)
4. වෙබ් අඩවි නිර්මාණය (HTML Tags, Lists, Tables, Links)
5. තොරතුරු හා සන්නිවේදන තාක්ෂණය සහ සමාජය (ආචාර ධර්ම, සයිබර් නීතිය, ඊ-අපද්‍රව්‍ය)

⛔ **දැඩි නීති (Strict Rules):**
1. ඉහත O/L විෂය නිර්දේශයෙන් පිට කිසිදු දැනුමක් (A/L ICT, Python, Java, C++, Cloud) ඇතුළත් නොකරන්න.
2. පෙළපොතේ ඇති නිල සිංහල තාක්ෂණික වචනම පමණක් යොදාගන්න.
3. ${excludedTopicsText}

Return STRICTLY in JSON format with no markdown wrappers or extra text:
{
  "grade": "10 ශ්‍රේණිය හෝ 11 ශ්‍රේණිය",
  "unit": "නිල පාඩමේ නම",
  "topic": "උප මාතෘකාව",
  "content": "පෙළපොත් කරුණු ඇසුරෙන් පැහැදිලි කෙටි හැඳින්වීම",
  "keyPoints": [
    "🔹 විභාගයට වැදගත් කරුණ 1",
    "🔹 විභාගයට වැදගත් කරුණ 2",
    "🔹 විභාගයට වැදගත් කරුණ 3"
  ]
}`;

    const requestBody = {
        contents: [
            {
                parts: [
                    { text: promptText }
                ]
            }
        ],
        generationConfig: { 
            responseMimeType: "application/json", 
            temperature: 0.2
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
        console.log('Gemini AI මඟින් පෙළපොත් විෂය නිර්දේශය කියවා කෙටි සටහන සකසමින් පවතී...');
        
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
