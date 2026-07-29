import { Note, Folder, Tag, Edge } from '../types';

export interface AppData {
  notes: Note[];
  folders: Folder[];
  tags: Tag[];
  edges: Edge[];
}

const fetchAllData = async (): Promise<AppData> => {
  try {
    const response = await fetch('/api/notes', { method: 'GET' });
    if (!response.ok) throw new Error('Gagal mengambil data dari server');
    const data = await response.json();
    return {
      notes: data.notes || [],
      folders: data.folders || [],
      tags: data.tags || [],
      edges: data.edges || []
    };
  } catch (error: any) {
    console.error("Error fetching data:", error);
    return { notes: [], folders: [], tags: [], edges: [] };
  }
};

const saveAllData = async (data: AppData): Promise<void> => {
  try {
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Gagal menyimpan ke server');
    }
  } catch (error: any) {
    console.error("Error saving data:", error);
    alert("SINKRONISASI GAGAL: " + error.message + "\n\n1. Cek Vercel Environment Variables Anda.\n2. Pastikan GOOGLE_DRIVE_DB_FILE_ID adalah ID File, bukan ID Folder.");
  }
};

export const getNotes = async (): Promise<Note[]> => {
  const data = await fetchAllData();
  return data.notes;
};

export const getFolders = async (): Promise<Folder[]> => {
  const data = await fetchAllData();
  return data.folders;
};

export const saveNote = async (note: Note): Promise<void> => {
  const data = await fetchAllData();
  const index = data.notes.findIndex(n => n.id === note.id);
  if (index > -1) data.notes[index] = note;
  else data.notes.push(note);
  await saveAllData(data);
};

export const deleteNote = async (id: string): Promise<void> => {
  const data = await fetchAllData();
  data.notes = data.notes.filter(n => n.id !== id);
  await saveAllData(data);
};

export const saveFolder = async (folder: Folder): Promise<void> => {
  const data = await fetchAllData();
  const index = data.folders.findIndex(f => f.id === folder.id);
  if (index > -1) data.folders[index] = folder;
  else data.folders.push(folder);
  await saveAllData(data);
};

export const deleteFolder = async (id: string): Promise<void> => {
  const data = await fetchAllData();
  data.folders = data.folders.filter(f => f.id !== id);
  await saveAllData(data);
};
