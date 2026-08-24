require('dotenv').config();

// 🇱🇰 Timezone එක ලංකාවේ වෙලාවට සැකසීම
process.env.TZ = 'Asia/Colombo';

const { default: makeWASocket, DisconnectReason, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const http = require('http');
const cron = require('node-cron');
const admin = require('firebase-admin');

// Render Port scan check එක
http.createServer((req, res) => res.end('Grade 11 ICT Short Note Bot is Running!')).listen(process.env.PORT || 3000);

// 🔥 Firebase Admin Initialize කිරීම
let firebaseCreds;
try {
    firebaseCreds = JSON.parse(process.env.FIREBASE_CREDENTIALS);
} catch (error) {
    console.error("⚠️ Firebase Credentials දෝෂයක්! FIREBASE_CREDENTIALS පරීක්ෂා කරන්න.");
}

admin.initializeApp({
    credential: admin.credential.cert(firebaseCreds),
    databaseURL: process.env.FIREBASE_DB_URL
});

const db = admin.database();
const authRef = db.ref('grade11_bot_auth'); 
const noteHistoryRef = db.ref('grade11_note_history');

// 🛠️ Firebase Keys වලට තහනම් අක්ෂර (. # $ [ ]) Encode/Decode කිරීම
const fixKey = (key) => key.replace(/\./g, '_dot_').replace(/#/g, '_hash_').replace(/\$/g, '_dollar_').replace(/\[/g, '_lbracket_').replace(/\]/g, '_rbracket_').replace(/\//g, '_slash_');
const unfixKey = (key) => key.replace(/_dot_/g, '.').replace(/_hash_/g, '#').replace(/_dollar_/g, '$').replace(/_lbracket_/g, '[').replace(/_rbracket_/g, ']').replace(/_slash_/g, '/');

// 🔒 Firebase-backed Safe Auth State
async function useFirebaseAuth(ref) {
    let creds;
    const credsSnapshot = await ref.child('creds').once('value');
    const rawCreds = credsSnapshot.val();

    if (rawCreds) {
        creds = JSON.parse(rawCreds, BufferJSON.reviver);
    } else {
        creds = initAuthCreds();
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        const safeId = fixKey(id);
                        const snap = await ref.child(`keys/${type}/${safeId}`).once('value');
                        const val = snap.val();
                        if (val) {
                            data[id] = JSON.parse(val, BufferJSON.reviver);
                        }
                    }
                    return data;
                },
                set: async (data) => {
                    const updates = {};
                    for (const type in data) {
                        for (const id in data[type]) {
                            const safeId = fixKey(id);
                            const val = data[type][id];
                            if (val) {
                                updates[`keys/${type}/${safeId}`] = JSON.stringify(val, BufferJSON.replacer);
                            } else {
                                updates[`keys/${type}/${safeId}`] = null;
                            }
                        }
                    }
                    await ref.update(updates);
                }
            }
        },
        saveCreds: async () => {
            await ref.child('creds').set(JSON.stringify(creds, BufferJSON.replacer));
        }
    };
}

async function appendToNoteHistory(data) {
    try {
        const timeString = new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' });
        const entry = {
            timestamp: timeString,
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
    const { state, saveCreds } = await useFirebaseAuth(authRef);
    
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
            
            if (statusCode === DisconnectReason.loggedOut) {
                console.log('⚠️ Session එක Clear කර අලුතෙන් Login වෙන්න සූදානම් වේ...');
                await authRef.remove();
            }
            
            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ Grade 11 Short Note Bot සාර්ථකව සම්බන්ධ විය!');
            
            if (!cronStarted) {
                cronStarted = true;
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
            await sock.sendMessage(chatJid, { text: '🔄 ටෙස්ට් කිරීම ආරම්භ විය. Grade 11 Short Note එක සකසමින් පවතී...' });
            sendDailyShortNote(activeSock); 
        }

        if (messageText === '!notehistory') {
            try {
                const snapshot = await noteHistoryRef.once('value');
                const historyData = snapshot.val();
                
                if (historyData) {
                    let textContent = "📚 මෙතෙක් යවන ලද Grade 11 ICT කෙටි සටහන් එකතුව\n\n";
                    
                    Object.values(historyData).forEach(data => {
                        textContent += `==================================================\n` +
                                       `📅 දිනය: ${data.timestamp}\n` +
                                       `📖 පාඩම: ${data.unit}\n` +
                                       `📌 මාතෘකාව: ${data.topic}\n\n` +
                                       `📝 සටහන:\n${data.content}\n\n` +
                                       `💡 විශේෂ කරුණු:\n${data.keyPoints.join('\n')}\n` +
                                       `==================================================\n\n`;
                    });

                    await sock.sendMessage(chatJid, {
                        document: Buffer.from(textContent, 'utf-8'),
                        mimetype: 'text/plain',
                        fileName: 'Grade_11_ICT_Short_Notes.txt',
                        caption: '📚 මෙතෙක් යවන ලද සියලුම 11 වසර ICT කෙටි සටහන් එකතුව මෙන්න!'
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
        ? `Strictly AVOID generating notes for these topics again: ${JSON.stringify(previousTopics.slice(-40))}` 
        : '';

    const promptText = `You are an expert Sri Lankan GCE O/L ICT Teacher preparing revision short notes for Grade 11 students.
    Generate ONE high-yield, exam-focused revision short note in clean, simple Sinhala based strictly on the Sri Lankan Grade 11 ICT syllabus.

    Grade 11 Focus Areas:
    - Programming & Flowcharts (Pascal concepts, Control structures, Arrays, Pseudocode)
    - Systems Development Life Cycle (SDLC phases, Testing methods, Deployment methods)
    - Internet & Web Technologies (HTML tags, CSS, protocols like HTTP/FTP/IP)
    - Computer Networks (Topologies, Transmission media, IP addressing, Network devices)
    - Database Management (Entities, Attributes, Relationships, Keys, SQL basic queries)
    - Multimedia & ICT in Society (File formats, Compression, Ethical issues)

    ${excludedTopicsText}

    CRITICAL RULES:
    1. The note must be concise, extremely clear, and formatted for quick revision.
    2. Keep explanations easy for O/L students to memorize.
    3. Provide 3-4 bullet points as 'keyPoints' (Quick Memory Tips / විභාගයට වැදගත් කරුණු).

    Return STRICTLY in JSON format:
    {
      "unit": "පාඩමේ නම (e.g. ක්‍රමලේඛනය - Programming)",
      "topic": "උප මාතෘකාව (e.g. While Loop සහ Repeat Until අතර වෙනස)",
      "content": "පැහැදිලි කෙටි සටහන (Clear paragraph with Sinhala technical terms)",
      "keyPoints": [
        "🔹 කරුණ 1",
        "🔹 කරුණ 2",
        "🔹 කරුණ 3"
      ]
    }`;

    const requestBody = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.8 }
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
        console.log('Gemini AI මඟින් 11 වසර කෙටි සටහන සකසමින් පවතී...');
        
        const noteData = await generateShortNoteFromGemini();

        const targetGroups = [
            '120363429635141660@g.us', // ඔයාගේ Group JID එක
        ];

        const messageText = 
`📌 *G.C.E. O/L ICT - Grade 11 Quick Revision*
━━━━━━━━━━━━━━━━━━━━━
📖 *පාඩම:* ${noteData.unit}
🎯 *මාතෘකාව:* ${noteData.topic}
━━━━━━━━━━━━━━━━━━━━━

📝 *කෙටි සටහන:*
${noteData.content}

💡 *විභාගයට වැදගත් විශේෂ කරුණු:*
${noteData.keyPoints.join('\n')}

━━━━━━━━━━━━━━━━━━━━━
_දිනපතා කෙටි සටහන් ලබා ගැනීමට සම්බන්ධ වී සිටින්න._
👨‍🏫 *ICT with Dhanush Pathirana*`;

        for (const targetJid of targetGroups) {
            await sock.sendMessage(targetJid, { text: messageText });
        }
        
        console.log('✅ සියලුම 11 වසර ගෲප් වෙත කෙටි සටහන සාර්ථකව යැව්වා!');
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
