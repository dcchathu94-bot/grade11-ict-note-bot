require('dotenv').config();

// 🇱🇰 Timezone එක ලංකාවේ වෙලාවට සැකසීම
process.env.TZ = 'Asia/Colombo';

const http = require('http');
const PORT = process.env.PORT || 3000;

// 🚀 Render Web Service එක Active තබා ගැනීම
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Grade 10 & 11 ICT Short Note Poster Bot is Live 24/7!\n');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Server is live on port ${PORT}`);
});

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const admin = require('firebase-admin');
const nodeHtmlToImage = require('node-html-to-image');

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

// 🎨 HTML / CSS මඟින් High Quality Short Note Poster එකක් Render කිරීම
async function createShortNoteImage(noteData) {
    const pointsHtml = (noteData.keyPoints || []).map((pt, idx) => `
        <div class="tip-card">
            <div class="tip-icon">✔</div>
            <div class="tip-text">${pt}</div>
        </div>
    `).join('');

    const subCardsHtml = (noteData.sections || []).map((sec, idx) => {
        const colors = ['#0056b3', '#28a745', '#e65c00', '#6f42c1'];
        const color = colors[idx % colors.length];
        return `
            <div class="sub-card">
                <div class="sub-card-num" style="background: ${color};">0${idx + 1}</div>
                <div class="sub-card-body">
                    <div class="sub-card-title" style="color: ${color};">${sec.title}</div>
                    <div class="sub-card-desc">${sec.desc}</div>
                </div>
            </div>
        `;
    }).join('');

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="si">
    <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Sinhala:wght@400;600;700;800;900&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                font-family: 'Noto Sans Sinhala', sans-serif;
                background-color: #f4f7fa;
                width: 780px;
                padding: 15px;
            }
            .poster {
                background: #ffffff;
                border-radius: 20px;
                overflow: hidden;
                border: 2px solid #e1e8ed;
                box-shadow: 0 10px 30px rgba(0,0,0,0.08);
            }
            /* Header */
            .header {
                background: linear-gradient(135deg, #0d1b2a 0%, #1b263b 100%);
                color: #ffffff;
                padding: 14px 24px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .header-title {
                font-size: 20px;
                font-weight: 800;
                letter-spacing: 0.5px;
                color: #ffcc00;
            }
            .header-badge {
                background: #0077b6;
                color: #ffffff;
                padding: 6px 16px;
                border-radius: 20px;
                font-size: 15px;
                font-weight: 700;
            }
            /* Title Section */
            .title-section {
                text-align: center;
                padding: 20px 20px 10px 20px;
                background: #ffffff;
            }
            .unit-name {
                font-size: 16px;
                font-weight: 700;
                color: #415a77;
                margin-bottom: 4px;
            }
            .topic-name {
                font-size: 25px;
                font-weight: 900;
                color: #0d1b2a;
                line-height: 1.3;
            }
            /* Main Content Box */
            .content-box {
                margin: 10px 20px 15px 20px;
                border-radius: 12px;
                border: 2px solid #ffb703;
                background: #fffdf5;
                overflow: hidden;
            }
            .content-badge {
                background: #ffb703;
                color: #000814;
                font-size: 14px;
                font-weight: 800;
                padding: 4px 14px;
                display: inline-block;
                border-bottom-right-radius: 10px;
            }
            .content-text {
                padding: 10px 16px 14px 16px;
                font-size: 15px;
                line-height: 1.6;
                color: #1b263b;
                font-weight: 600;
            }
            /* Sub Cards */
            .sub-cards-container {
                margin: 0 20px 15px 20px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .sub-card {
                display: flex;
                background: #ffffff;
                border: 1.5px solid #e0e6ed;
                border-radius: 10px;
                overflow: hidden;
            }
            .sub-card-num {
                color: #ffffff;
                font-size: 18px;
                font-weight: 900;
                width: 46px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }
            .sub-card-body {
                padding: 8px 14px;
                flex-grow: 1;
            }
            .sub-card-title {
                font-size: 15px;
                font-weight: 800;
                margin-bottom: 2px;
            }
            .sub-card-desc {
                font-size: 14px;
                color: #334155;
                line-height: 1.45;
                font-weight: 600;
            }
            /* Exam Tips Section */
            .tips-section {
                margin: 0 20px 20px 20px;
                background: #f0f7ff;
                border-radius: 12px;
                border: 1.5px solid #bae6fd;
                padding: 14px 16px;
            }
            .tips-header {
                font-size: 15px;
                font-weight: 800;
                color: #0369a1;
                margin-bottom: 10px;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .tip-card {
                display: flex;
                align-items: flex-start;
                gap: 8px;
                margin-bottom: 8px;
            }
            .tip-icon {
                background: #0284c7;
                color: #ffffff;
                border-radius: 50%;
                width: 18px;
                height: 18px;
                font-size: 11px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-top: 3px;
                flex-shrink: 0;
            }
            .tip-text {
                font-size: 14px;
                color: #0f172a;
                line-height: 1.4;
                font-weight: 600;
            }
            /* Footer */
            .footer {
                background: #0d1b2a;
                color: #ffffff;
                padding: 12px 24px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-top: 1px solid #334155;
            }
            .brand {
                font-size: 16px;
                font-weight: 800;
                color: #38bdf8;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .slogan {
                font-size: 13px;
                color: #cbd5e1;
                font-weight: 600;
            }
        </style>
    </head>
    <body>
        <div class="poster">
            <div class="header">
                <div class="header-title">G.C.E. O/L ICT - Quick Revision</div>
                <div class="header-badge">${noteData.grade || 'O/L ICT'}</div>
            </div>

            <div class="title-section">
                <div class="unit-name">📖 ${noteData.unit}</div>
                <div class="topic-name">📌 ${noteData.topic}</div>
            </div>

            <div class="content-box">
                <div class="content-badge">📝 කෙටි සටහන</div>
                <div class="content-text">${noteData.content}</div>
            </div>

            ${noteData.sections && noteData.sections.length > 0 ? `<div class="sub-cards-container">${subCardsHtml}</div>` : ''}

            <div class="tips-section">
                <div class="tips-header">💡 විභාගයට වැදගත් විශේෂ කරුණු</div>
                ${pointsHtml}
            </div>

            <div class="footer">
                <div class="brand">👨‍🏫 ICT with Dhanush Pathirana</div>
                <div class="slogan">📅 දිනපතා කෙටි සටහන් ලබා ගැනීමට සම්බන්ධ වන්න</div>
            </div>
        </div>
    </body>
    </html>
    `;

    // PNG Image Buffer එකක් සාදා ආපසු ලබා දීම
    const imageBuffer = await nodeHtmlToImage({
        html: htmlContent,
        type: 'png',
        puppeteerArgs: {
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        }
    });

    return imageBuffer;
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
            console.log('✅ ICT Short Note Poster Bot සාර්ථකව සම්බන්ධ විය!');
            
            if (!cronStarted) {
                cronStarted = true;
                // උදේ 8.00 සහ සවස 4.00 ට
                cron.schedule('0 8,16 * * *', () => {
                    console.log('⏰ නියමිත වෙලාව පැමිණ ඇත. Short Note Image එක සකසමින් පවතී...');
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
            await sock.sendMessage(chatJid, { text: '🔄 ටෙස්ට් කිරීම ආරම්භ විය. Image Poster එක සකසමින් පවතී (තත්පර කිහිපයක් ගතවේ)...' });
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
3. මාතෘකාව යටතේ ප්‍රධාන ක්‍රම/වර්ග/අදියර 2 සිට 4 දක්වා ඇත්නම් ඒවා "sections" array එකට එක් කරන්න.
4. ${excludedTopicsText}

Return STRICTLY in JSON format:
{
  "grade": "10 ශ්‍රේණිය හෝ 11 ශ්‍රේණිය",
  "unit": "පෙළපොතේ ඇති පාඩමේ නම",
  "topic": "උප මාතෘකාව",
  "content": "පෙළපොත ඇසුරෙන් කෙටි හැඳින්වීම",
  "sections": [
    {
      "title": "උප අංශය 1 (e.g. සෘජු ස්ථාපනය - Direct Deployment)",
      "desc": "පැහැදිලි කෙටි විස්තරය"
    },
    {
      "title": "උප අංශය 2 (e.g. සමාන්තර ස්ථාපනය - Parallel Deployment)",
      "desc": "පැහැදිලි කෙටි විස්තරය"
    }
  ],
  "keyPoints": [
    "විභාගයට අතිශය වැදගත් කෙටි කරුණ 1",
    "විභාගයට අතිශය වැදගත් කෙටි කරුණ 2",
    "විභාගයට අතිශය වැදගත් කෙටි කරුණ 3"
  ]
}`;

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        fileData: {
                            mimeType: "application/pdf",
                            fileUri: "https://generativelanguage.googleapis.com/v1beta/files/x7clqnazq98o" // 10 පෙළපොත
                        }
                    },
                    {
                        fileData: {
                            mimeType: "application/pdf",
                            fileUri: "https://generativelanguage.googleapis.com/v1beta/files/he8on2exgrfx" // 11 පෙළපොත
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
            temperature: 0.25 
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

        console.log('🎨 Poster Image එක Render කරමින් පවතී...');
        const imageBuffer = await createShortNoteImage(noteData);

        const targetGroups = [
            '120363429635141660@g.us', // ඔයාගේ WhatsApp Group JID එක
        ];

        const captionText = 
`📌 *G.C.E. O/L ICT - Quick Revision* (${noteData.grade || 'Grade 10/11'})
📖 *පාඩම:* ${noteData.unit}
🎯 *මාතෘකාව:* ${noteData.topic}

👨‍🏫 *ICT with Dhanush Pathirana*`;

        for (const targetJid of targetGroups) {
            await sock.sendMessage(targetJid, { 
                image: imageBuffer, 
                caption: captionText 
            });
        }
        
        console.log('✅ සියලුම ගෲප් වෙත Short Note Image එක සාර්ථකව යැව්වා!');
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
