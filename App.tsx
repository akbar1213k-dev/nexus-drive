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
import { getNotes, getFolders, saveNote, deleteNote, saveFolder, deleteFolder } from './services/storage';
// Catatan: Jika getFolders, saveFolder, deleteFolder belum ada di storage.ts Anda, 
// kita akan perlu menambahkannya nanti, atau untuk saat ini biarkan fungsi-fungsi tersebut tidak dipanggil.

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
      expiredNotes.forEach(async (n) => {
        await deleteDoc(doc(db, "notes", n.id));
        removeFromLocalStorage(n.id);
      });

      const expiredFolders = folders.filter(f => f.deletedAt && (now - f.deletedAt > ONE_DAY_MS));
      expiredFolders.forEach(async (f) => {
        await deleteDoc(doc(db, "folders", f.id));
      });
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
    const batchPromises = [
      ...noteIds.map(id => updateDoc(doc(db, "notes", id), { deletedAt: time, updatedAt: time })),
      ...folderIds.map(id => updateDoc(doc(db, "folders", id), { deletedAt: time }))
    ];
    await Promise.all(batchPromises);
    alert("Item dipindahkan ke Sampah. Akan dihapus permanen dalam 24 jam.");
  };
  
  const handleRestore = async (noteIds: string[], folderIds: string[]) => {
    const batchPromises = [
      ...noteIds.map(id => updateDoc(doc(db, "notes", id), { deletedAt: null })),
      ...folderIds.map(id => updateDoc(doc(db, "folders", id), { deletedAt: null }))
    ];
    await Promise.all(batchPromises);
  };

  const handleHardDelete = async (noteIds: string[], folderIds: string[]) => {
    if(!confirm("Hapus permanen? Data tidak bisa dikembalikan.")) return;
    noteIds.forEach(id => { deleteDoc(doc(db, "notes", id)); removeFromLocalStorage(id); });
    folderIds.forEach(id => deleteDoc(doc(db, "folders", id)));
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
    if (mode === 'EDITOR' && noteId && user) {
        const now = Date.now();
        
        // 1. Update State Lokal agar UI langsung berubah
        setNotes(prev => prev.map(n => 
            n.id === noteId ? { ...n, lastOpenedAt: now } : n
        ));

        // 2. Update ke Firebase (Silent update, tidak perlu loading state)
        // Kita gunakan updateDoc langsung tanpa menunggu
        updateDoc(doc(db, "notes", noteId), { lastOpenedAt: now })
            .catch(err => console.error("Failed to update last opened:", err));
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
  
  // --- AUTH LISTENER & PERCEPATAN ---
   []);

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

  // --- FIREBASE LISTENERS ---
  useEffect(() => {
    if (!user) return;
    setDbError('');

    // Karena user.uid mungkin dari local storage (fake user), query tetap akan jalan
    // dan Firebase akan menangani caching data-nya.
    const qNotes = query(
      collection(db, "notes"), 
      where("userId", "==", user.uid), 
      orderBy("updatedAt", "desc")
    );

    const unsubNotes = onSnapshot(qNotes, (snap) => {
      const serverNotes = snap.docs.map(d => d.data() as Note);
      const localNotes = getLocalNotes();
       
      const mergedNotes = serverNotes.map(sNote => {
        const lNote = localNotes.find(l => l.id === sNote.id);
        return (lNote && lNote.updatedAt > sNote.updatedAt) ? lNote : sNote;
      });

      localNotes.forEach(lNote => {
        if (!mergedNotes.find(m => m.id === lNote.id)) mergedNotes.push(lNote);
      });

      mergedNotes.sort((a, b) => b.updatedAt - a.updatedAt);
      // --- LOGIKA RESET CHECKBOX BERJANGKA ---
      const now = new Date();
      let hasUpdates = false;
      
      // Clone array agar bisa dimodifikasi
      const updatedNotes = mergedNotes.map(note => {
          // Hanya proses jika konten memiliki checkbox recurring
          if (note.content.includes('class="todo-item recurring"')) {
              const docParser = new DOMParser();
              const docHTML = docParser.parseFromString(note.content, 'text/html');
              const checkboxes = docHTML.querySelectorAll('input.recurring, .todo-item.recurring input');
              
              let noteChanged = false;

              checkboxes.forEach((cb: any) => {
                  const checkedTime = cb.getAttribute('data-checked-time');
                  const daysInterval = parseInt(cb.getAttribute('data-days') || '0');

                  if (cb.checked && checkedTime && daysInterval > 0) {
                      const lastCheckedDate = new Date(parseInt(checkedTime));
                      
                      // Hitung Target Reset: Jam 00:00 setelah (Interval) hari
                      const targetResetDate = new Date(lastCheckedDate);
                      targetResetDate.setDate(targetResetDate.getDate() + daysInterval);
                      targetResetDate.setHours(0, 0, 0, 0); // Set jam 12 malam pas

                      // Jika sekarang sudah melewati waktu reset
                      if (now >= targetResetDate) {
                          cb.removeAttribute('checked');
                          cb.removeAttribute('data-checked-time');
                          
                          // Hapus style coret di parent
                          const parent = cb.closest('.todo-item');
                          if (parent) parent.classList.remove('completed');
                          
                          noteChanged = true;
                      }
                  }
              });

              if (noteChanged) {
                  hasUpdates = true;
                  const newContent = docHTML.body.innerHTML;
                  
                  // Update Firebase diam-diam
                  updateDoc(doc(db, "notes", note.id), { 
                      content: newContent,
                      updatedAt: Date.now() // Opsional: update timestamp atau tidak
                  });
                  
                  return { ...note, content: newContent };
              }
          }
          return note;
      });

      // Update state lokal jika ada yang di-reset agar UI langsung berubah
      if (hasUpdates) {
          setNotes(updatedNotes);
      } else {
          setNotes(mergedNotes);
      }
      
      setIsReady(true);
      // ...

      if (localNotes.length > 0) setSyncStatus('unsaved');
    }, (err) => {
      // Abaikan error permission sementara jika user object masih "fake"
      // karena update user asli akan segera menyusul
      if (err.code !== 'permission-denied') {
          console.error("Notes Sync Error:", err);
          setDbError(`Gagal memuat Catatan: ${err.message}`);
      }
    });

    const qFolders = query(
      collection(db, "folders"), 
      where("userId", "==", user.uid), 
      orderBy("createdAt", "desc")
    );
    
    const unsubFolders = onSnapshot(qFolders, (snap) => {
      setFolders(snap.docs.map(d => d.data() as Folder));
    }, (err) => {
      if (err.code !== 'permission-denied') {
        console.error("Folder Sync Error:", err);
        setDbError(prev => prev ? prev : `Gagal memuat Folder: ${err.message}`);
      }
    });

    return () => { unsubNotes(); unsubFolders(); };
  }, [user]); // useEffect akan re-run ketika user berubah dari "Fake" ke "Asli"

   

   

  const handleManualSync = async () => {
      if (!user) return;
      setSyncStatus('syncing');
      try {
          const localNotes = getLocalNotes();
          if (localNotes.length === 0) {
              setSyncStatus('saved');
              setTimeout(() => setSyncStatus('idle'), 2000);
              return;
          }
          const promises = localNotes.map(async (note) => {
              const noteToSync = { ...note, userId: user.uid };
              await setDoc(doc(db, "notes", note.id), noteToSync, { merge: true });
              removeFromLocalStorage(note.id); 
          });
          await Promise.all(promises);
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

  const handleUpdateNote = (updated: Note) => {
    if (!user) return;
    const noteWithUser = { ...updated, userId: user.uid, updatedAt: Date.now() }; 
    setNotes(prev => prev.map(n => n.id === updated.id ? noteWithUser : n));
    saveToLocalStorage(noteWithUser);
    
    if (isAutoSync) {
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(() => {
             setDoc(doc(db, "notes", updated.id), noteWithUser, { merge: true })
                .then(() => { 
                   removeFromLocalStorage(updated.id); 
                   setSyncStatus('saved'); 
                   setTimeout(() => setSyncStatus('idle'), 2000); 
                });
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
    if (!user) return '';
    const id = Date.now().toString();
    const finalTitle = title.trim() || 'Untitled';
    const newNote: Note = { 
      id, userId: user.uid, title: finalTitle, content: '', updatedAt: Date.now(), type, folderId: folderId || "" 
    };
    setNotes(p => [newNote, ...p]);
    saveToLocalStorage(newNote); 
    if (isAutoSync) setDoc(doc(db, "notes", id), newNote, { merge: true });
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
    if (!user) {
        alert("⚠️ GAGAL IMPORT: Anda harus LOGIN terlebih dahulu agar data bisa disimpan ke akun Anda.");
        return;
    }

    try {
        const notesToImport = data.notes || [];
        const foldersToImport = data.folders || [];

        if (notesToImport.length === 0 && foldersToImport.length === 0) {
            alert("File JSON kosong atau format tidak dikenali.");
            return;
        }

        const promises = [
            ...notesToImport.map(x => setDoc(doc(db, "notes", x.id), { 
                ...x, 
                userId: user.uid, 
                updatedAt: x.updatedAt || Date.now() 
            })),
            ...foldersToImport.map(x => setDoc(doc(db, "folders", x.id), { 
                ...x, 
                userId: user.uid 
            }))
        ];

        await Promise.all(promises);
        alert(`✅ Sukses! Berhasil memulihkan ${notesToImport.length} catatan dan ${foldersToImport.length} folder.`);
        window.location.reload(); 

    } catch (err: any) {
        console.error("Detail Error Import:", err);
        alert(`❌ Terjadi kesalahan saat menyimpan ke database:\n\n${err.message}`);
    }
  };

  const handleDeleteCurrentNote = async () => {
    if (!currentNoteId || !user) return;
    
    // UBAH 1: Konfirmasi dipindahkan ke sampah, bukan hapus permanen
    if (confirm("Pindahkan catatan ini ke Sampah?")) {
      try {
        // UBAH 2: Gunakan handleSoftDelete, jangan deleteDoc
        // Kita masukkan currentNoteId ke dalam array karena handleSoftDelete butuh array
        await handleSoftDelete([currentNoteId], []);
        
        // Kembali ke menu utama setelah dihapus
        navigateTo('HOME');
      } catch (err: any) {
        alert("Gagal memindahkan ke sampah: " + err.message);
      }
    }
  };

  const handleMoveCurrentNote = async (targetFolderId: string | undefined) => {
    if (!currentNoteId || !user) return;
    try {
      await updateDoc(doc(db, "notes", currentNoteId), { 
        folderId: targetFolderId || "", updatedAt: Date.now() 
      });
      setNotes(prev => prev.map(n => 
        n.id === currentNoteId 
          ? { ...n, folderId: targetFolderId || "", updatedAt: Date.now() } 
          : n
      ));
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
                        userId={user?.uid} 
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
                  onLogout={handleLogout}
                  userEmail={user?.email}
                  isAnonymous={user?.isAnonymous}
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
                    onDeleteItems={(noteIds) => handleSoftDelete(noteIds, [])} // Graph hanya menampilkan Note, folderIds kosong
                    onMoveItems={(noteIds, targetFolderId) => {
                        noteIds.forEach(id => {
                            updateDoc(doc(db, "notes", id), { 
                                folderId: targetFolderId || "", 
                                updatedAt: Date.now() 
                            });
                        });
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
                                userId: user.uid,
                                deletedAt: null 
                            };
                            setFolders(prev => [newFolder, ...prev]);
                            await setDoc(doc(db, "folders", targetId), newFolder);
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
                        await setDoc(doc(db, "folders", id), { 
                            id, 
                            name, 
                            createdAt: Date.now(), 
                            userId: user?.uid,
                            parentId: parentId || null // Simpan Parent ID
                        });
                    }} 
                    onRenameFolder={(id, n) => updateDoc(doc(db, "folders", id), { name: n })} 
                    onDeleteItems={handleSoftDelete} 
                    onRestoreItems={handleRestore}
                    onOpenTractApp={() => navigateTo('TRACT')}
                    onPermanentDelete={handleHardDelete}
                    onMoveItems={(noteIds, folderIds, targetFolderId) => {
                         // 1. Pindahkan Notes
                         noteIds.forEach(id => {
                            updateDoc(doc(db, "notes", id), { 
                                folderId: targetFolderId || "", 
                                updatedAt: Date.now() 
                            });
                         });
            
                         // 2. Pindahkan Folders (Nested)
                         folderIds.forEach(id => {
                            updateDoc(doc(db, "folders", id), { 
                                parentId: targetFolderId || null 
                            });
                         });
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
