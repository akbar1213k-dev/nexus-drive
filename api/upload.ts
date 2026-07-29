// api/upload.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import stream from 'stream';

// Inisialisasi Google Auth
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.split(String.raw`\n`).join('\n').replace(/"/g, '') 
      : undefined,
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Hanya menerima metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Kita menerima gambar dalam bentuk Base64 dari frontend
    const { fileName, mimeType, base64Data } = req.body;
    const folderId = process.env.GOOGLE_DRIVE_MEDIA_FOLDER_ID;

    if (!fileName || !mimeType || !base64Data) {
      return res.status(400).json({ error: 'Data gambar tidak lengkap' });
    }

    // Mengubah Base64 kembali menjadi Buffer Stream agar bisa diunggah ke Drive
    const buffer = Buffer.from(base64Data, 'base64');
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    // Meta data file untuk Google Drive
    const fileMetadata = {
      name: fileName,
      parents: [folderId as string], // Menyimpan di dalam folder media
    };

    const media = {
      mimeType: mimeType,
      body: bufferStream,
    };

    // Proses upload ke Google Drive
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webContentLink',
    });

    const fileId = response.data.id as string;

    // Mengubah izin file menjadi "Public (Siapa saja yang memiliki link dapat melihat)"
    // Ini wajib agar gambar bisa ditampilkan/dirender di aplikasi React Anda
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    // Mengembalikan URL langsung ke file gambar
    return res.status(200).json({ 
      success: true, 
      fileId: fileId,
      url: response.data.webContentLink 
    });

  } catch (error: any) {
    console.error("Upload Error:", error.message);
    return res.status(500).json({ error: 'Gagal mengunggah gambar ke Google Drive' });
  }
}
