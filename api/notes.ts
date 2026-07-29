// api/notes.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';

// Inisialisasi Google Auth
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'), // Memperbaiki format newline
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fileId = process.env.GOOGLE_DRIVE_DB_FILE_ID;

  try {
    if (req.method === 'GET') {
      // Logika untuk MENGAMBIL data dari db.json
      const response = await drive.files.get({
        fileId: fileId as string,
        alt: 'media',
      });
      
      return res.status(200).json(response.data || { notes: [], tags: [], edges: [] });
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
