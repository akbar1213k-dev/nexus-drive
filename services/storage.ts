// services/storage.ts
// Menghubungkan aplikasi React dengan Vercel Serverless Function (Google Drive)

// Asumsi kita menggunakan tipe data dari types.ts yang ada di proyek Anda
import { Note, Tag, Edge } from '../types'; // Sesuaikan import ini jika nama tipenya berbeda

export interface AppData {
  notes: Note[];
  tags: Tag[];
  edges: Edge[];
}

/**
 * Mengambil seluruh data (Catatan, Tag, Relasi) dari Google Drive via API
 */
export const loadData = async (): Promise<AppData> => {
  try {
    const response = await fetch('/api/notes', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error('Gagal mengambil data dari Google Drive');
    }
    
    const data = await response.json();
    
    // Jika file db.json masih kosong, kembalikan array kosong
    if (!data.notes) {
      return { notes: [], tags: [], edges: [] };
    }
    
    return data as AppData;
  } catch (error) {
    console.error("Error loading data:", error);
    // Kembalikan state kosong jika terjadi error agar aplikasi tidak crash
    return { notes: [], tags: [], edges: [] };
  }
};

/**
 * Menyimpan seluruh perubahan data kembali ke Google Drive via API
 */
export const saveData = async (data: AppData): Promise<boolean> => {
  try {
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Gagal menyimpan data ke Google Drive');
    }

    return true;
  } catch (error) {
    console.error("Error saving data:", error);
    return false;
  }
};
