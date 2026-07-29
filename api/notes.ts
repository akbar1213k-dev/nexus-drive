// api/notes.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';

// Inisialisasi Google Auth
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY 
        ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined,
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fileId = process.env.GOOGLE_DRIVE_DB_FILE_ID;

  try {
    if (req.method === 'GET') {
      const response = await drive.files.get({
        fileId: fileId as string,
        alt: 'media',
      });
      
      let data = response.data;
      
      // Jika file di Drive benar-benar kosong (string kosong), kita berikan data awal default
      if (typeof data === 'string') {
         if (data.trim() === '') {
             data = { notes: [], folders: [], tags: [], edges: [] };
         } else {
             try { 
                 data = JSON.parse(data); 
             } catch(e) { 
                 data = { notes: [], folders: [], tags: [], edges: [] }; 
             }
         }
      }
      
      // Pastikan struktur dasar JSON selalu ada agar aplikasi tidak error
      const finalData = data || {};
      return res.status(200).json({
         notes: finalData.notes || [],
         folders: finalData.folders || [],
         tags: finalData.tags || [],
         edges: finalData.edges || []
      });
    }
    
    else if (req.method === 'POST') {
      // Logika untuk MENYIMPAN/UPDATE data ke db.json
      const media = {
        mimeType: 'application/json',
        body: JSON.stringify(req.body),
      };

      await drive.files.update({
        fileId: fileId as string,
        media: media,
      });

      return res.status(200).json({ message: 'Data berhasil disimpan ke Google Drive' });
    } 
    
    else {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
  } catch (error: any) {
    console.error("Google Drive API Error:", error.message);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server' });
  }
}
