import { X, Folder as FolderIcon } from 'lucide-react'; 
import React, { useState, useEffect, useRef } from 'react';
import { Note, Folder, ViewMode, EditorHandle } from './types';
import { Editor } from './components/Editor';
import { GraphView } from './components/GraphView';
import { TopBar } from './components/TopBar';
import { HomeView } from './components/HomeView';
import { PreviewSheet } from './components/PreviewSheet';
import { SettingsView } from './components/SettingsView';
import { TractView } from './components/TractView';
import { getNotes, saveNote, deleteNote } from './services/storage';

// --- HELPER: LOCAL STORAGE (Tetap sama) --
const getLocalNotes = (): Note[] => {
  try { return JSON.parse(localStorage.getItem('nexus_backup_notes') || '[]'); } catch { return []; }
};
const saveToLocalStorage = (note: Note) => {
  const local = getLocalNotes();
  const filtered = local.filter(n => n.id !== note.id);
  localStorage.setItem('nexus_backup_notes', JSON.stringify([...filtered, note]));
};
const removeFromLocalStorage = (noteId: string) => {
  const local = getLocalNotes();
  const filtered = local.filter(n => n.id !== noteId);
  localStorage.setItem('nexus_backup_notes', JSON.stringify(filtered));
};
const clearLocalStorage = () => localStorage.removeItem('nexus_backup_notes');

export default function App() {
  // [PERCEPAT 1] Inisialisasi User langsung dari LocalStorage!

  // State Auth Loading kita hapus/tidak dipakai untuk blocking UI lagi
  // agar langsung tembus ke renderContent()

  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);

  // --- LOGIKA SAMPAH (AUTO DELETE 24 JAM) ----
  useEffect(() => {
    if (!notes.length && !folders.length) return;
    
    const ONE_DAY_MS = 24 * 60 * 60 * 1000; 
    const now = Date.now();

    const cleanupTrash = async () => {
      const expiredNotes = notes.filter(n => n.deletedAt && (now - n.deletedAt > ONE_DAY_MS));
      for (const n of expiredNotes) {
        await deleteNote(n.id);
        removeFromLocalStorage(n.id);
      }

      const expiredFolders = folders.filter(f => f.deletedAt && (now - f.deletedAt > ONE_DAY_MS));
      for (const f of expiredFolders) {
        // Hapus komentar di bawah saat fitur folder selesai dibuat
        // await deleteFolder(f.id); 
      }
      
      // Jika ada yang dihapus, fetch ulang dari Drive
      if (expiredNotes.length > 0 || expiredFolders.length > 0) {
         const dataNotes = await getNotes();
         setNotes(dataNotes);
         // setFolders(await getFolders());
      }
    };

    const timer = setInterval(cleanupTrash, 60000); 
    cleanupTrash(); 
    return () => clearInterval(timer);
  }, [notes, folders]);

  // Fungsi Soft Delete 
  const handleSoftDelete = async (noteIds: string[], folderIds: string[]) => {
    const protectedFolderNames = ["Keterhubungan"];
    const foldersToDelete = folders.filter(f => folderIds.includes(f.id));
    const isProtected = foldersToDelete.some(f => protectedFolderNames.includes(f.name));

    if (isProtected) {
        alert("Folder 'Keterhubungan' adalah folder sistem dan tidak dapat dihapus.");
        folderIds = folderIds.filter(id => {
            const folder = folders.find(f => f.id === id);
            return folder && !protectedFolderNames.includes(folder.name);
        });
        if (noteIds.length === 0 && folderIds.length === 0) return;
    }

    const time = Date.now();
    
    // 1. Update State Lokal
    const updatedNotes = notes.map(n => noteIds.includes(n.id) ? { ...n, deletedAt: time, updatedAt: time } : n);
    const updatedFolders = folders.map(f => folderIds.includes(f.id) ? { ...f, deletedAt: time } : f);
    
    setNotes(updatedNotes);
    setFolders(updatedFolders);
    
    // 2. Simpan ke Google Drive (Satu per satu)
    for (const noteId of noteIds) {
       const note = updatedNotes.find(n => n.id === noteId);
       if (note) await saveNote(note);
    }
    // (Abaikan simpan folder ke Drive sementara waktu sampai storage folder siap)

    alert("Item dipindahkan ke Sampah. Akan dihapus permanen dalam 24 jam.");
  };
  
  const handleRestore = async (noteIds: string[], folderIds: string[]) => {
    const updatedNotes = notes.map(n => noteIds.includes(n.id) ? { ...n, deletedAt: null } : n);
    const updatedFolders = folders.map(f => folderIds.includes(f.id) ? { ...f, deletedAt: null } : f);
    
    setNotes(updatedNotes);
    setFolders(updatedFolders);

    for (const noteId of noteIds) {
       const note = updatedNotes.find(n => n.id === noteId);
       if (note) await saveNote(note);
    }
  };

  const handleHardDelete = async (noteIds: string[], folderIds: string[]) => {
    if(!confirm("Hapus permanen? Data tidak bisa dikembalikan.")) return;
    
    for (const id of noteIds) { 
      await deleteNote(id); 
      removeFromLocalStorage(id); 
    }
    
    // Fitur hapus folder dari Google Drive akan ditambahkan nanti
    // for (const id of folderIds) { await deleteFolder(id); }
    
    setNotes(prev => prev.filter(n => !noteIds.includes(n.id)));
    setFolders(prev => prev.filter(f => !folderIds.includes(f.id)));
  };
   
  // Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isLoadingAuth, setIsLoadingAuth] = useState(false); 
   
  const [isResetting, setIsResetting] = useState(false); 
  const [resetMessage, setResetMessage] = useState('');

  const [showEditorMoveDialog, setShowEditorMoveDialog] = useState(false);

  const [dbError, setDbError] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('HOME');
  const [currentNoteId, setCurrentNoteId] = useState<string>(''); 
  const [previewNoteId, setPreviewNoteId] = useState<string | null>(null);

  const [isAutoSync, setIsAutoSync] = useState(() => {
    try {
        const saved = localStorage.getItem('nexus_auto_sync');
        return saved !== null ? JSON.parse(saved) : true; 
    } catch { return true; }
  });
   
  const [syncInterval, setSyncInterval] = useState(() => {
     try {
        const saved = localStorage.getItem('nexus_sync_interval');
        return saved ? Number(saved) : 1500;
     } catch { return 1500; }
  });

  useEffect(() => {
    localStorage.setItem('nexus_auto_sync', JSON.stringify(isAutoSync));
  }, [isAutoSync]);

  useEffect(() => {
    localStorage.setItem('nexus_sync_interval', syncInterval.toString());
  }, [syncInterval]);

  const [isReady, setIsReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved' | 'error' | 'unsaved'>('idle');

  const editorRef = useRef<EditorHandle>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('nexus_theme');
      return saved !== null ? JSON.parse(saved) : false; 
    } catch { return false; }
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('nexus_theme', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    // Membaca URL saat aplikasi pertama kali dibuka (Direct Link)
    const path = window.location.pathname.toLowerCase();
    let initialMode: ViewMode = 'HOME';
    let initialNoteId = '';
    let currentPath = path;

    if (path === '/tractapp') {
        initialMode = 'TRACT';
    } else if (path === '/settings') {
        initialMode = 'SETTINGS';
    } else if (path === '/graph') {
        initialMode = 'GRAPH';
    } else if (path.startsWith('/editor/')) {
        initialMode = 'EDITOR';
        initialNoteId = path.replace('/editor/', '');
    } else {
        // Jika path kosong (/) atau tidak dikenali, paksa ke /home
        initialMode = 'HOME';
        currentPath = '/home'; 
    }

    setViewMode(initialMode);
    setCurrentNoteId(initialNoteId);
    window.history.replaceState({ mode: initialMode, noteId: initialNoteId }, '', currentPath);

    const handlePopState = (event: PopStateEvent) => {
      if (event.state) {
        setViewMode(event.state.mode);
        setCurrentNoteId(event.state.noteId || '');
      } else {
        setViewMode('HOME');
        setCurrentNoteId('');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (mode: ViewMode, noteId: string = '') => {
    if (viewMode === mode && currentNoteId === noteId) return;
    
    // --- TAMBAHAN BARU: Update lastOpenedAt saat membuka editor ---
    if (mode === 'EDITOR' && noteId) {
        const now = Date.now();
        setNotes(prev => prev.map(n => n.id === noteId ? { ...n, lastOpenedAt: now } : n));
        
        const noteToUpdate = notes.find(n => n.id === noteId);
        if (noteToUpdate) {
            saveNote({ ...noteToUpdate, lastOpenedAt: now }).catch(console.error);
        }
    }
    // --------------
    setViewMode(mode);
    setCurrentNoteId(noteId);
    
    // Mengubah URL Address Bar sesuai menu yang dibuka
    let newPath = '/home'; // Default menjadi /home
    if (mode === 'TRACT') newPath = '/tractapp';
    else if (mode === 'SETTINGS') newPath = '/settings';
    else if (mode === 'GRAPH') newPath = '/graph';
    else if (mode === 'EDITOR') newPath = `/editor/${noteId}`;

    window.history.pushState({ mode, noteId }, '', newPath);
  };

  // Efek Otomatis untuk Mengubah Judul Tab Browser
  useEffect(() => {
    switch (viewMode) {
      case 'TRACT':
        document.title = 'TractApp - Lacak Aktivitas';
        break;
      case 'HOME':
        document.title = 'Beranda - Nexus Notes';
        break;
      case 'SETTINGS':
        document.title = 'Pengaturan - Nexus Notes';
        break;
      case 'GRAPH':
        document.title = 'Grafik Visual - Nexus Notes';
        break;
      case 'EDITOR':
        // Kita juga bisa membuat ini lebih dinamis jika mau, tapi ini standar yang bagus
        document.title = 'Editor Catatan - Nexus Notes'; 
        break;
      default:
        document.title = 'Nexus Notes';
        break;
    }
  }, [viewMode]);
  


  // --- USEEFFECT BARU DRIVE ---
  useEffect(() => {
  const loadDataFromDrive = async () => {
    setIsReady(false);
    try {
      const dataNotes = await getNotes();
      // Asumsikan Anda juga punya fungsi getFolders di storage.ts
      // const dataFolders = await getFolders(); 
      setNotes(dataNotes);
      // setFolders(dataFolders);
    } catch (error) {
      setDbError("Gagal memuat data dari Google Drive");
    } finally {
      setIsReady(true);
    }
  };
  
  loadDataFromDrive();
}, []);

  // --- FIREBASE LISTENERS TELAH DIHAPUS ---
  // (Data sekarang memuat murni dari fungsi loadDataFromDrive)

   

   

  const handleManualSync = async () => {
      setSyncStatus('syncing');
      try {
          const localNotes = getLocalNotes();
          if (localNotes.length === 0) {
              setSyncStatus('saved');
              setTimeout(() => setSyncStatus('idle'), 2000);
              return;
          }
          for (const note of localNotes) {
              await saveNote({ ...note, userId: 'local_user' });
              removeFromLocalStorage(note.id); 
          }
          setSyncStatus('saved');
          setTimeout(() => setSyncStatus('idle'), 2000);
      } catch (error) {
          console.error("Manual Sync Error:", error);
          setSyncStatus('error');
      }
  };

  useEffect(() => {
      if (isAutoSync) {
          handleManualSync();
      }
  }, [isAutoSync]);

  const handleUpdateNote = async (updated: Note) => {
    // Hilangkan referensi userId karena kita cuma pakai 1 user pribadi
    const noteToSave = { ...updated, updatedAt: Date.now() }; 
    
    setNotes(prev => prev.map(n => n.id === updated.id ? noteToSave : n));
    saveToLocalStorage(noteToSave);
    
    if (isAutoSync) {
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(async () => {
             await saveNote(noteToSave);
             removeFromLocalStorage(updated.id); 
             setSyncStatus('saved'); 
             setTimeout(() => setSyncStatus('idle'), 2000); 
        }, syncInterval); 
    } else {
        setSyncStatus('unsaved');
    }
  };

  const handleCreateNote = async (
    title: string, 
    type: 'note' | 'mindmap' = 'note', 
    folderId?: string,
    shouldNavigate: boolean = false 
  ): Promise<string> => {
    const id = Date.now().toString();
    const finalTitle = title.trim() || 'Untitled';
    const newNote: Note = { 
      id, userId: 'local_user', title: finalTitle, content: '', updatedAt: Date.now(), type, folderId: folderId || "" 
    };
    
    setNotes(p => [newNote, ...p]);
    saveToLocalStorage(newNote); 
    
    if (isAutoSync) await saveNote(newNote);
    
    if (shouldNavigate) navigateTo('EDITOR', id);
    return id;
  };

  const getTopBarTitle = () => {
    if (viewMode === 'EDITOR') {
      const activeNote = notes.find(n => n.id === currentNoteId);
      return activeNote ? (activeNote.title || 'Untitled Note') : 'Nexus Notes';
    }
    if (viewMode === 'TRACT') {
      return 'Activity Tracker';
    }
    return 'Nexus Notes';
  };

 const handleImportData = async (data: { notes: Note[], folders: Folder[] }) => {
    try {
        const notesToImport = data.notes || [];

        if (notesToImport.length === 0) {
            alert("File JSON kosong atau format tidak dikenali.");
            return;
        }

        for (const note of notesToImport) {
            await saveNote({ ...note, userId: 'local_user', updatedAt: note.updatedAt || Date.now() });
        }
        
        alert(`✅ Sukses! Berhasil memulihkan ${notesToImport.length} catatan. (Sinkronisasi Folder ditangguhkan sementara)`);
        window.location.reload(); 

    } catch (err: any) {
        console.error("Detail Error Import:", err);
        alert(`❌ Terjadi kesalahan:\n\n${err.message}`);
    }
  };

  const handleDeleteCurrentNote = async () => {
    if (!currentNoteId) return;
    
    if (confirm("Pindahkan catatan ini ke Sampah?")) {
      try {
        await handleSoftDelete([currentNoteId], []);
        navigateTo('HOME');
      } catch (err: any) {
        alert("Gagal memindahkan ke sampah: " + err.message);
      }
    }
  };

  const handleMoveCurrentNote = async (targetFolderId: string | undefined) => {
    if (!currentNoteId) return;
    try {
      const time = Date.now();
      
      // 1. Ubah di tampilan UI secara instan
      setNotes(prev => prev.map(n => 
        n.id === currentNoteId 
          ? { ...n, folderId: targetFolderId || "", updatedAt: time } 
          : n
      ));
      
      // 2. Simpan perubahan ke Google Drive
      const noteToUpdate = notes.find(n => n.id === currentNoteId);
      if (noteToUpdate) {
         await saveNote({ ...noteToUpdate, folderId: targetFolderId || "", updatedAt: time });
      }
      
      setShowEditorMoveDialog(false);
      alert("Catatan berhasil dipindahkan!");
    } catch (err: any) {
      alert("Gagal memindahkan: " + err.message);
    }
  };

  // [PERCEPAT 4] Kita HILANGKAN block "if (isAuthLoading)" yang menampilkan Splash Screen.
  // Dan karena state "user" diinisialisasi dengan data dari localStorage,
  // maka kondisi "if (!user)" di bawah ini akan bernilai FALSE (terlewati)
  // sehingga aplikasi langsung merender Konten Utama.

  // --- RENDER CONTENT ---
  const renderContent = () => {
    if (dbError) {
        return (
            <div className="flex flex-col h-full items-center justify-center p-6 text-center">
                 <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">!</div>
                 <h2 className="text-xl font-bold text-red-600 mb-2">Terjadi Kesalahan Database</h2>
                 <div className="bg-gray-100 p-4 rounded-lg text-xs font-mono text-left w-full mb-4 break-words overflow-auto max-h-40 border border-gray-300">
                    {dbError}
                 </div>
                 {dbError.includes('index') && (
                      <div className="space-y-2">
                         <p className="text-sm text-gray-600">Anda perlu membuat Index di Firebase.</p>
                         <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">Buka Firebase Console</a>
                      </div>
                 )}
            </div>
        );
    }

    // Data akan langsung terisi dalam sepersekian milidetik dari memori lokal (Cache-First). (hapus */ dibawah ini jika ingin digunakan)
    if (!isReady) return <div className="flex h-full items-center justify-center text-gray-400 font-medium">Memuat data...</div>;
    
  
    switch (viewMode) {
        case 'TRACT':
            return (
                <div className="absolute inset-0 z-50 bg-white dark:bg-gray-950 overflow-hidden flex flex-col">
                    <TractView 
                        onGoHome={() => navigateTo('HOME')} 
                        userId={'local_user'} 
                        notes={notes} 
                        onLinkClick={(id) => navigateTo('EDITOR', id)} 
                    />
                </div>
            );
        
        case 'SETTINGS':
            return (
                <SettingsView 
                  isAutoSync={isAutoSync}
                  onToggleAutoSync={setIsAutoSync}
                  syncInterval={syncInterval}
                  onChangeInterval={setSyncInterval}
                  onLogout={() => alert('Mode Offline: Fitur keluar akun tidak diperlukan.')}
                  userEmail={'Akun Pribadi'}
                  isAnonymous={false}
                  notes={notes}
                  folders={folders}
                  onImportData={handleImportData}
                />
            );
            
        case 'GRAPH': 
            return (
                <GraphView 
                    notes={notes}
                    folders={folders} 
                    onNodeClick={(id) => navigateTo('EDITOR', id)} 
                    isDarkMode={isDarkMode} 
                    activeNoteId={currentNoteId} 
                    // --- TAMBAHKAN PROPS INI ---
                    onDeleteItems={(noteIds) => handleSoftDelete(noteIds, [])}
                    onMoveItems={async (noteIds, targetFolderId) => {
                        const time = Date.now();
                        
                        setNotes(prev => prev.map(n => 
                            noteIds.includes(n.id) ? { ...n, folderId: targetFolderId || "", updatedAt: time } : n
                        ));
                        
                        for (const id of noteIds) {
                            const noteToUpdate = notes.find(n => n.id === id);
                            if (noteToUpdate) {
                                await saveNote({ ...noteToUpdate, folderId: targetFolderId || "", updatedAt: time });
                            }
                        }
                    }}
                />
            );
        
        case 'EDITOR': 
            const n = notes.find(x => x.id === currentNoteId);
            // Jika data belum siap (isReady = false), tampilkan loading. Jika sudah siap tapi data tetap tidak ada, baru tampilkan 404.
            if (!n) return !isReady ? <div className="p-6 text-gray-400">Membuka catatan...</div> : <div>Catatan tidak ditemukan (404)</div>;
            return (
                <Editor 
                    ref={editorRef} 
                    note={n} 
                    allNotes={notes} 
                    onUpdate={handleUpdateNote} 
                    onCreateNewNote={async (title) => {
                        const LINKED_FOLDER_NAME = "Keterhubungan";
                        let linkedFolder = folders.find(f => f.name === LINKED_FOLDER_NAME);
                        let targetId = linkedFolder?.id;
                        if (!targetId) {
                            targetId = 'f_linked_' + Date.now();
                            const newFolder: Folder = { 
                                id: targetId, 
                                name: LINKED_FOLDER_NAME, 
                                createdAt: Date.now(), 
                                userId: 'local_user',
                                deletedAt: null 
                            };
                            setFolders(prev => [newFolder, ...prev]);
                            // (Abaikan simpan folder ke Drive sementara)
                        }
                        return handleCreateNote(title, 'note', targetId, false);
                    }}
                    onLinkClick={(id) => navigateTo('EDITOR', id)} 
                    onLinkLongPress={setPreviewNoteId} 
                    onGoHome={() => window.history.length > 1 ? window.history.back() : navigateTo('HOME')}
                />
            );

        default: 
            return (
                <HomeView 
                    notes={notes} 
                    folders={folders} 
                    onNoteClick={(id) => navigateTo('EDITOR', id)} 
                    onCreateNote={(type, folderId) => handleCreateNote('', type, folderId, true)} 
                    onCreateFolder={async (name, parentId) => {
                        const id = 'f_' + Date.now();
                        const newFolder = { 
                            id, 
                            name, 
                            createdAt: Date.now(), 
                            userId: 'local_user',
                            parentId: parentId || null,
                            deletedAt: null
                        };
                        setFolders(prev => [newFolder, ...prev]);
                    }}
                    onRenameFolder={async (id, n) => {
                        setFolders(prev => prev.map(f => f.id === id ? { ...f, name: n } : f));
                        const folderToUpdate = folders.find(f => f.id === id);
                        // Fitur save folder dari Google Drive akan ditambahkan nanti
                        // if (folderToUpdate) await saveFolder({ ...folderToUpdate, name: n });
                    }} 
                    onDeleteItems={handleSoftDelete} 
                    onRestoreItems={handleRestore}
                    onOpenTractApp={() => navigateTo('TRACT')}
                    onPermanentDelete={handleHardDelete}
                    onMoveItems={async (noteIds, folderIds, targetFolderId) => {
                         const time = Date.now();
                         
                         setNotes(prev => prev.map(n => noteIds.includes(n.id) ? { ...n, folderId: targetFolderId || "", updatedAt: time } : n));
                         setFolders(prev => prev.map(f => folderIds.includes(f.id) ? { ...f, parentId: targetFolderId || null } : f));
                         
                         for (const id of noteIds) {
                             const n = notes.find(x => x.id === id);
                             if (n) await saveNote({ ...n, folderId: targetFolderId || "", updatedAt: time });
                         }
                         for (const id of folderIds) {
                             const f = folders.find(x => x.id === id);
                             // if (f) await saveFolder({ ...f, parentId: targetFolderId || null });
                         }
                    }}
                    onImportData={handleImportData}
                />
            );
    }
  };
  
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 transition-colors">
      <TopBar 
        mode={viewMode} 
        onToggleMode={() => navigateTo(viewMode === 'GRAPH' ? 'EDITOR' : 'GRAPH', currentNoteId)} 
        title={getTopBarTitle()} 
        isDarkMode={isDarkMode} 
        onToggleTheme={() => setIsDarkMode(p => !p)} 
        onUndo={() => editorRef.current?.undo()} 
        onRedo={() => editorRef.current?.redo()} 
        syncStatus={syncStatus} 
        isAutoSync={isAutoSync} 
        onManualSync={handleManualSync} 
        onOpenSettings={() => navigateTo('SETTINGS')}
        onGoHome={() => window.history.length > 1 ? window.history.back() : navigateTo('HOME')} 
        onForceHome={() => navigateTo('HOME')} 
        onGoToParent={() => {
            // Algoritma: Cari 1 Catatan yang isi kontennya memiliki ID catatan kita saat ini
            const parentNote = notes.find(n => n.content.includes(`data-id="${currentNoteId}"`));
            if (parentNote) {
                navigateTo('EDITOR', parentNote.id);
            } else {
                alert("Catatan ini belum memiliki Induk (Belum ditautkan dari catatan manapun).");
            }
        }}
        onDeleteNote={handleDeleteCurrentNote}
        onMoveNote={() => setShowEditorMoveDialog(true)}
      />
      
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {renderContent()}
      </div>
      
      {showEditorMoveDialog && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
              <h3 className="font-bold text-lg dark:text-white">Pindahkan ke...</h3>
              <button onClick={() => setShowEditorMoveDialog(false)}><X size={20} className="text-gray-500"/></button>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
               <button 
                onClick={() => handleMoveCurrentNote(undefined)}
                className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3 text-gray-700 dark:text-gray-200"
               >
                 <FolderIcon size={20} className="text-gray-400" />
                 <span>Home (Tanpa Folder)</span>
               </button>

                  {folders.filter(f => !f.deletedAt).map(f => (
                    <button 
                      key={f.id}
                      onClick={() => handleMoveCurrentNote(f.id)}
                   className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3 text-gray-700 dark:text-gray-200"
                 >
                   <FolderIcon size={20} className="text-amber-500" />
                   <span>{f.name}</span>
                 </button>
               ))}

               {folders.length === 0 && (
                 <div className="p-4 text-center text-gray-400 text-sm">Belum ada folder lain.</div>
               )}
            </div>
          </div>
        </div>
      )}
      
      <PreviewSheet 
        note={notes.find(n => n.id === previewNoteId) || null} 
        onClose={() => setPreviewNoteId(null)} 
        onOpenFull={() => previewNoteId && navigateTo('EDITOR', previewNoteId)} 
      />
    </div>
  );
}
