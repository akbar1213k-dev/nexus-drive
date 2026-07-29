// services/storage.ts
import { Note, Tag, Edge } from '../types';

export interface AppData {
  notes: Note[];
  tags: Tag[];
  edges: Edge[];
}

// -------------------------------------------------------------
// FUNGSI INTI API (GET/POST ke Vercel Serverless Function)
// -------------------------------------------------------------

/** Mengambil seluruh data dari Google Drive */
const fetchAllData = async (): Promise<AppData> => {
  try {
    const response = await fetch('/api/notes', { method: 'GET' });
    if (!response.ok) throw new Error('Gagal mengambil data');
    const data = await response.json();
    return {
      notes: data.notes || [],
      tags: data.tags || [],
      edges: data.edges || []
    };
  } catch (error) {
    console.error("Error fetching data:", error);
    return { notes: [], tags: [], edges: [] };
  }
};

/** Menyimpan seluruh data ke Google Drive */
const saveAllData = async (data: AppData): Promise<void> => {
  try {
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Gagal menyimpan data');
  } catch (error) {
    console.error("Error saving data:", error);
  }
};

// -------------------------------------------------------------
// ADAPTOR UNTUK KOMPONEN UI (App.tsx / Editor.tsx / GraphView.tsx)
// -------------------------------------------------------------

export const getNotes = async (): Promise<Note[]> => {
  const data = await fetchAllData();
  return data.notes;
};

export const getTags = async (): Promise<Tag[]> => {
  const data = await fetchAllData();
  return data.tags;
};

export const getEdges = async (): Promise<Edge[]> => {
  const data = await fetchAllData();
  return data.edges;
};

export const saveNote = async (note: Note): Promise<void> => {
  const data = await fetchAllData();
  const index = data.notes.findIndex(n => n.id === note.id);
  
  if (index > -1) {
    data.notes[index] = note; // Update
  } else {
    data.notes.push(note); // Insert baru
  }
  
  await saveAllData(data);
};

export const deleteNote = async (id: string): Promise<void> => {
  const data = await fetchAllData();
  data.notes = data.notes.filter(n => n.id !== id);
  // Optional: Hapus juga edge yang berhubungan dengan node ini jika diperlukan
  data.edges = data.edges.filter(e => e.source !== id && e.target !== id);
  await saveAllData(data);
};

export const saveTags = async (tags: Tag[]): Promise<void> => {
  const data = await fetchAllData();
  data.tags = tags;
  await saveAllData(data);
};

export const saveEdges = async (edges: Edge[]): Promise<void> => {
  const data = await fetchAllData();
  data.edges = edges;
  await saveAllData(data);
};
