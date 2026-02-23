
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Copy, 
  Folder, 
  Terminal, 
  Check, 
  Layout, 
  Image as ImageIcon,
  ChevronRight,
  Monitor,
  Moon,
  Sun,
  X,
  Edit2,
  SortAsc,
  Calendar,
  Layers,
  ChevronDown,
  FolderPlus,
  RefreshCcw,
  Trash,
  Download,
  Upload,
  AlertCircle
} from 'lucide-react';
import { PromptEntry, Category, ViewMode, SortOption } from './types';
import { resizeImage } from './components/ImageResizer';
import { generatePythonScript } from './services/geminiService';

const DEFAULT_CATEGORIES: Category[] = [
  { id: '1', name: 'Work' },
  { id: '2', name: 'Art' },
  { id: '3', name: 'Hebrew Project' },
  { id: '4', name: 'Coding' },
];

const ALL_CATEGORY_ID = 'all';
const TRASH_CATEGORY_ID = 'trash';

const App: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>(() => {
    const saved = localStorage.getItem('pa_categories');
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
  });

  const [prompts, setPrompts] = useState<PromptEntry[]>(() => {
    const saved = localStorage.getItem('pa_prompts');
    return saved ? JSON.parse(saved) : [];
  });

  const [activeCategoryId, setActiveCategoryId] = useState<string>(ALL_CATEGORY_ID);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.MANAGE);
  const [sortOption, setSortOption] = useState<SortOption>(SortOption.NEWEST);
  
  const [pythonCode, setPythonCode] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Category Management State
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['1', '2', '3', '4']));

  // Form State for new prompt
  const [isAdding, setIsAdding] = useState(false);
  const [newPrompt, setNewPrompt] = useState({ title: '', content: '', image: '', categoryId: '' });

  // Backup Import State
  const [importData, setImportData] = useState<{ categories: Category[], prompts: PromptEntry[] } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('pa_categories', JSON.stringify(categories));
    localStorage.setItem('pa_prompts', JSON.stringify(prompts));
  }, [categories, prompts]);

  // CRUD for Categories
  const handleAddCategory = (parentId?: string) => {
    const newCat: Category = {
      id: crypto.randomUUID(),
      name: parentId ? 'New Sub-folder' : 'New Collection',
      parentId: parentId
    };
    setCategories([...categories, newCat]);
    setEditingCategoryId(newCat.id);
    setEditCategoryName(newCat.name);
    setActiveCategoryId(newCat.id);
    if (parentId) {
      setExpandedCategories(prev => new Set(prev).add(parentId));
    }
  };

  const handleRenameCategory = (id: string) => {
    if (!editCategoryName.trim()) {
      setEditingCategoryId(null);
      return;
    }
    setCategories(categories.map(c => c.id === id ? { ...c, name: editCategoryName } : c));
    setEditingCategoryId(null);
  };

  const handleDeleteCategory = (id: string) => {
    if (categories.length <= 1) {
      alert("You must have at least one category.");
      return;
    }
    
    const getChildIds = (parentId: string): string[] => {
      const children = categories.filter(c => c.parentId === parentId);
      return children.reduce((acc, child) => [...acc, child.id, ...getChildIds(child.id)], [] as string[]);
    };

    if (confirm(`Delete this folder? Its prompts will be moved to Trash.`)) {
      const idsToDelete = [id, ...getChildIds(id)];
      const remaining = categories.filter(c => !idsToDelete.includes(c.id));
      setPrompts(prompts.map(p => idsToDelete.includes(p.categoryId) ? { ...p, categoryId: TRASH_CATEGORY_ID } : p));
      setCategories(remaining);
      if (idsToDelete.includes(activeCategoryId)) {
        setActiveCategoryId(ALL_CATEGORY_ID);
      }
    }
  };

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(expandedCategories);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedCategories(newSet);
  };

  // Backup Logic
  const handleExportBackup = () => {
    const data = {
      version: "1.1",
      categories,
      prompts,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prompt-manager-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.categories && parsed.prompts) {
          setImportData({ categories: parsed.categories, prompts: parsed.prompts });
          setShowImportModal(true);
        } else {
          alert('Invalid backup file format.');
        }
      } catch (err) {
        alert('Error parsing backup file.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const finalizeImport = (mode: 'merge' | 'overwrite') => {
    if (!importData) return;

    if (mode === 'overwrite') {
      setCategories(importData.categories);
      setPrompts(importData.prompts);
    } else {
      // Merge logic: avoid duplicate IDs
      const existingPromptIds = new Set(prompts.map(p => p.id));
      const existingCategoryIds = new Set(categories.map(c => c.id));

      const newCategories = [
        ...categories,
        ...importData.categories.filter(c => !existingCategoryIds.has(c.id))
      ];
      const newPrompts = [
        ...prompts,
        ...importData.prompts.filter(p => !existingPromptIds.has(p.id))
      ];

      setCategories(newCategories);
      setPrompts(newPrompts);
    }

    setShowImportModal(false);
    setImportData(null);
    alert(`Import successful (${mode} mode)`);
  };

  // Drag and Drop Logic
  const handleDragStart = (e: React.DragEvent, promptId: string) => {
    e.dataTransfer.setData('promptId', promptId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, categoryId: string) => {
    if (categoryId === ALL_CATEGORY_ID) return;
    e.preventDefault();
    setDragOverCategoryId(categoryId);
  };

  const handleDrop = (e: React.DragEvent, categoryId: string) => {
    if (categoryId === ALL_CATEGORY_ID) return;
    e.preventDefault();
    const promptId = e.dataTransfer.getData('promptId');
    if (promptId) {
       setPrompts(prompts.map(p => p.id === promptId ? { ...p, categoryId } : p));
    }
    setDragOverCategoryId(null);
  };

  const filteredAndSortedPrompts = useMemo(() => {
    let result = prompts.filter(p => {
      if (activeCategoryId === ALL_CATEGORY_ID) return p.categoryId !== TRASH_CATEGORY_ID;
      if (activeCategoryId === TRASH_CATEGORY_ID) return p.categoryId === TRASH_CATEGORY_ID;
      return p.categoryId === activeCategoryId;
    }).filter(p => {
      const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.content.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });

    result.sort((a, b) => {
      switch (sortOption) {
        case SortOption.NEWEST: return b.createdAt - a.createdAt;
        case SortOption.OLDEST: return a.createdAt - b.createdAt;
        case SortOption.TITLE_ASC: return a.title.localeCompare(b.title);
        case SortOption.TITLE_DESC: return b.title.localeCompare(a.title);
        default: return 0;
      }
    });

    return result;
  }, [prompts, activeCategoryId, searchQuery, sortOption]);

  const handleOpenAddModal = () => {
    setNewPrompt({ 
      title: '', 
      content: '', 
      image: '', 
      categoryId: (activeCategoryId === ALL_CATEGORY_ID || activeCategoryId === TRASH_CATEGORY_ID) ? (categories[0]?.id || '') : activeCategoryId 
    });
    setIsAdding(true);
  };

  const handleAddPrompt = async () => {
    if (!newPrompt.title || !newPrompt.content || !newPrompt.categoryId) return;
    
    const entry: PromptEntry = {
      id: crypto.randomUUID(),
      title: newPrompt.title,
      content: newPrompt.content,
      image: newPrompt.image,
      categoryId: newPrompt.categoryId,
      createdAt: Date.now()
    };

    setPrompts([entry, ...prompts]);
    setIsAdding(false);
  };

  const handleDeletePrompt = (id: string) => {
    const prompt = prompts.find(p => p.id === id);
    if (!prompt) return;

    if (prompt.categoryId === TRASH_CATEGORY_ID) {
      if (confirm('Permanently delete this prompt? This action cannot be undone.')) {
        setPrompts(prompts.filter(p => p.id !== id));
      }
    } else {
      setPrompts(prompts.map(p => p.id === id ? { ...p, categoryId: TRASH_CATEGORY_ID } : p));
    }
  };

  const handleRestorePrompt = (id: string) => {
    const targetCategory = categories[0]?.id || '';
    setPrompts(prompts.map(p => p.id === id ? { ...p, categoryId: targetCategory } : p));
  };

  const handleEmptyTrash = () => {
    if (confirm('Are you sure you want to empty the trash? All prompts inside will be permanently deleted.')) {
      setPrompts(prompts.filter(p => p.categoryId !== TRASH_CATEGORY_ID));
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const thumbnail = await resizeImage(file);
      setNewPrompt(prev => ({ ...prev, image: thumbnail }));
    }
  };

  const handleGeneratePython = async () => {
    setIsGenerating(true);
    setViewMode(ViewMode.PYTHON_EXPORT);
    try {
      const code = await generatePythonScript(
        categories.map(c => c.name),
        prompts.filter(p => p.categoryId !== TRASH_CATEGORY_ID)
      );
      setPythonCode(code || '# No code generated');
    } catch (error) {
      setPythonCode('# Failed to generate Python script. Check API Key.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Sidebar Category Renderer
  const renderCategory = (cat: Category, level: number = 0) => {
    const isExpanded = expandedCategories.has(cat.id);
    const children = categories.filter(c => c.parentId === cat.id);
    const isPink = children.length > 0;
    const isActive = activeCategoryId === cat.id && viewMode === ViewMode.MANAGE;

    return (
      <div key={cat.id}>
        <div
          onDragOver={(e) => handleDragOver(e, cat.id)}
          onDragLeave={() => setDragOverCategoryId(null)}
          onDrop={(e) => handleDrop(e, cat.id)}
          className={`group relative w-full flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-all cursor-default ${
            dragOverCategoryId === cat.id ? 'ring-2 ring-blue-400 ring-inset bg-blue-50 dark:bg-blue-900/20' : ''
          } ${
            isActive
            ? 'bg-blue-600 text-white shadow-md' 
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#37373d]'
          }`}
          style={{ paddingLeft: `${(level * 16) + 12}px` }}
        >
          {children.length > 0 ? (
            <button onClick={(e) => toggleExpand(cat.id, e)} className="p-0.5 rounded hover:bg-black/10 transition-colors">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <div className="w-[18px]" />
          )}

          <button
            onClick={() => {
              setActiveCategoryId(cat.id);
              setViewMode(ViewMode.MANAGE);
            }}
            className="flex-1 flex items-center gap-2 truncate text-left font-medium"
          >
            <Folder 
              size={16} 
              className={isPink && !isActive ? "text-pink-500 fill-pink-500/10" : ""} 
            />
            {editingCategoryId === cat.id ? (
              <input
                autoFocus
                className="bg-white/10 text-white rounded px-1 outline-none w-full"
                value={editCategoryName}
                onChange={(e) => setEditCategoryName(e.target.value)}
                onBlur={() => handleRenameCategory(cat.id)}
                onKeyDown={(e) => e.key === 'Enter' && handleRenameCategory(cat.id)}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate">{cat.name}</span>
            )}
          </button>

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={(e) => { e.stopPropagation(); handleAddCategory(cat.id); }}
              className="p-1 rounded hover:bg-black/10 text-current"
              title="Add sub-folder"
            >
              <FolderPlus size={12} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setEditingCategoryId(cat.id); setEditCategoryName(cat.name); }}
              className="p-1 rounded hover:bg-black/10 text-current"
            >
              <Edit2 size={12} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
              className="p-1 rounded hover:bg-black/10 text-current"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
        {isExpanded && children.map(child => renderCategory(child, level + 1))}
      </div>
    );
  };

  const trashCount = prompts.filter(p => p.categoryId === TRASH_CATEGORY_ID).length;

  return (
    <div className="flex h-full bg-white dark:bg-[#1e1e1e] overflow-hidden text-gray-900 dark:text-gray-100">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImportFileSelect} 
        accept=".json" 
        className="hidden" 
      />

      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50 dark:bg-[#252526]">
        <div className="p-4 flex items-center gap-3 border-b border-gray-200 dark:border-gray-800">
          <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700">
               <span className="text-lg">💀</span>
            </div>
          </div>
          <div>
            <span className="block font-bold text-sm tracking-tight text-gray-800 dark:text-gray-100">Prompt Manager</span>
            <span className="block text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-widest">v1.1</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <button
            onClick={() => {
              setActiveCategoryId(ALL_CATEGORY_ID);
              setViewMode(ViewMode.MANAGE);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all mb-1 ${
              activeCategoryId === ALL_CATEGORY_ID && viewMode === ViewMode.MANAGE
              ? 'bg-blue-600 text-white shadow-md' 
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#37373d]'
            }`}
          >
            <Layers size={16} />
            <span className="font-semibold">כל הפתקים</span>
            <span className="ml-auto text-[10px] bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded-full font-bold">
              {prompts.filter(p => p.categoryId !== TRASH_CATEGORY_ID).length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveCategoryId(TRASH_CATEGORY_ID);
              setViewMode(ViewMode.MANAGE);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all mb-4 ${
              activeCategoryId === TRASH_CATEGORY_ID && viewMode === ViewMode.MANAGE
              ? 'bg-red-600 text-white shadow-md' 
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#37373d]'
            }`}
          >
            <Trash size={16} />
            <span className="font-semibold text-right">פח אשפה</span>
            <span className="ml-auto text-[10px] bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded-full font-bold">
              {trashCount}
            </span>
          </button>

          <div className="flex items-center justify-between px-3 mb-2">
            <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
              Collections
            </div>
            <button 
              onClick={() => handleAddCategory()}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-blue-500 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
          
          <div className="space-y-0.5">
            {categories.filter(c => !c.parentId).map(cat => renderCategory(cat))}
          </div>

          <div className="pt-6">
            <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 mb-2">
              Advanced Tools
            </div>
            <div className="space-y-1 px-1">
              <button
                onClick={handleGeneratePython}
                className={`w-full flex items-center gap-3 px-3 py-2 text-xs rounded-lg transition-all ${
                  viewMode === ViewMode.PYTHON_EXPORT 
                  ? 'bg-purple-600 text-white shadow-md' 
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#37373d]'
                }`}
              >
                <Terminal size={14} />
                <span>Export as macOS App</span>
              </button>
              
              <button
                onClick={handleExportBackup}
                className="w-full flex items-center gap-3 px-3 py-2 text-xs rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#37373d] transition-all"
              >
                <Download size={14} />
                <span>Export Backup (JSON)</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-3 px-3 py-2 text-xs rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#37373d] transition-all"
              >
                <Upload size={14} />
                <span>Import Backup (JSON)</span>
              </button>
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-between items-center">
          <button 
            onClick={() => document.documentElement.classList.toggle('dark')}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-[#37373d]"
          >
            <Moon size={16} className="hidden dark:block" />
            <Sun size={16} className="dark:hidden" />
          </button>
          <div className="text-[10px] opacity-40 font-mono tracking-tighter uppercase">Prompt Manager 1.1</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-gray-200 dark:border-gray-800 flex items-center px-6 justify-between bg-white dark:bg-[#1e1e1e]">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search title or content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-1.5 bg-gray-100 dark:bg-[#2a2d2e] border-none rounded-md text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 bg-gray-100 dark:bg-[#2a2d2e] rounded-md px-2 py-1">
              <SortAsc size={14} className="text-gray-400" />
              <select 
                className="bg-transparent border-none text-xs outline-none cursor-pointer text-gray-600 dark:text-gray-300 font-medium"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
              >
                <option value={SortOption.NEWEST}>Newest First</option>
                <option value={SortOption.OLDEST}>Oldest First</option>
                <option value={SortOption.TITLE_ASC}>Title A-Z</option>
                <option value={SortOption.TITLE_DESC}>Title Z-A</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
             {activeCategoryId === TRASH_CATEGORY_ID && trashCount > 0 && (
               <button
                 onClick={handleEmptyTrash}
                 className="flex items-center gap-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
               >
                 <Trash2 size={16} />
                 Empty Trash
               </button>
             )}
             <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
             >
              <Plus size={16} />
              New Prompt
             </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 dark:bg-[#1e1e1e]">
          {viewMode === ViewMode.MANAGE ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAndSortedPrompts.length === 0 ? (
                <div className="col-span-full py-20 flex flex-col items-center justify-center text-gray-400 gap-4">
                  <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                     <Layout size={32} className="opacity-20" />
                  </div>
                  <p className="text-sm font-medium">
                    {activeCategoryId === TRASH_CATEGORY_ID ? 'Trash is empty' : 'No prompts found here.'}
                  </p>
                </div>
              ) : (
                filteredAndSortedPrompts.map(prompt => (
                  <div 
                    key={prompt.id} 
                    draggable={prompt.categoryId !== TRASH_CATEGORY_ID}
                    onDragStart={(e) => handleDragStart(e, prompt.id)}
                    className={`group bg-white dark:bg-[#2d2d2d] rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg transition-all flex flex-col border-b-2 hover:border-blue-500/50 ${
                      prompt.categoryId === TRASH_CATEGORY_ID ? 'opacity-70 grayscale-[0.5] cursor-default' : 'cursor-grab active:cursor-grabbing'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">{prompt.title}</h3>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {prompt.categoryId === TRASH_CATEGORY_ID ? (
                          <>
                            <button 
                              onClick={() => handleRestorePrompt(prompt.id)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500"
                              title="Restore"
                            >
                              <RefreshCcw size={14} />
                            </button>
                            <button 
                              onClick={() => handleDeletePrompt(prompt.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                              title="Delete Permanently"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => handleCopy(prompt.content, prompt.id)}
                              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#37373d] text-gray-500"
                              title="Copy Prompt"
                            >
                              {copiedId === prompt.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                            </button>
                            <button 
                              onClick={() => handleDeletePrompt(prompt.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 hover:text-red-500"
                              title="Move to Trash"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {prompt.image && (
                      <div className="mb-3 rounded-lg overflow-hidden h-32 bg-gray-100 dark:bg-[#1e1e1e] border dark:border-gray-800">
                        <img src={prompt.image} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}

                    <div className="flex-1">
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-4 whitespace-pre-wrap leading-relaxed">
                        {prompt.content}
                      </p>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center text-[10px] text-gray-400 uppercase tracking-tighter">
                      <div className="flex items-center gap-1">
                        <Calendar size={10} />
                        <span>{new Date(prompt.createdAt).toLocaleDateString()}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 font-bold text-gray-500">
                        {prompt.categoryId === TRASH_CATEGORY_ID ? 'Trash' : (categories.find(c => c.id === prompt.categoryId)?.name || 'Unknown')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-gradient-to-br from-blue-600 to-purple-700 text-white p-8 rounded-2xl shadow-xl flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Python PyQt6 Exporter</h2>
                  <p className="opacity-80">This AI-generated script replicates your current workflow as a native macOS application.</p>
                </div>
                <div className="p-4 bg-white/20 rounded-full">
                  <Terminal size={48} />
                </div>
              </div>

              {isGenerating ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-500 font-medium">Architecting your desktop app...</p>
                </div>
              ) : (
                <div className="bg-[#1e1e1e] rounded-xl border border-gray-800 overflow-hidden shadow-2xl">
                  <div className="px-4 py-2 bg-[#2d2d2d] border-b border-gray-800 flex items-center justify-between">
                    <span className="text-xs text-gray-400 font-mono font-bold tracking-tight">prompt_manager_v1.1.py</span>
                    <button 
                      onClick={() => handleCopy(pythonCode, 'python')}
                      className="text-xs text-gray-400 hover:text-white flex items-center gap-1 font-bold"
                    >
                      {copiedId === 'python' ? <Check size={12} /> : <Copy size={12} />}
                      {copiedId === 'python' ? 'Copied' : 'Copy Code'}
                    </button>
                  </div>
                  <pre className="p-6 text-sm font-mono text-blue-300 overflow-x-auto selection:bg-blue-500/30">
                    <code>{pythonCode}</code>
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modal - New Prompt */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#2d2d2d] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-[#333]">
              <h3 className="font-semibold text-sm">Create New Prompt</h3>
              <button onClick={() => setIsAdding(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-[#444] rounded">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Title</label>
                  <input 
                    autoFocus
                    type="text"
                    placeholder="e.g., Marketing Tagline Generator"
                    className="w-full bg-gray-100 dark:bg-[#1e1e1e] border-none rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={newPrompt.title}
                    onChange={(e) => setNewPrompt(p => ({ ...p, title: e.target.value }))}
                  />
                </div>
                
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Target Collection</label>
                  <select
                    className="w-full bg-gray-100 dark:bg-[#1e1e1e] border-none rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none font-medium"
                    value={newPrompt.categoryId}
                    onChange={(e) => setNewPrompt(p => ({ ...p, categoryId: e.target.value }))}
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Prompt Content</label>
                <textarea 
                  rows={6}
                  placeholder="Paste your prompt instructions here..."
                  className="w-full bg-gray-100 dark:bg-[#1e1e1e] border-none rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm leading-relaxed"
                  value={newPrompt.content}
                  onChange={(e) => setNewPrompt(p => ({ ...p, content: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 tracking-wider">Reference Image (Optional)</label>
                <div className="flex items-center gap-4">
                  {newPrompt.image && (
                    <div className="relative group">
                      <img src={newPrompt.image} className="w-16 h-16 rounded-lg object-cover border dark:border-gray-700 shadow-sm" alt="" />
                      <button 
                        onClick={() => setNewPrompt(p => ({ ...p, image: '' }))}
                        className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}
                  <label className="flex-1 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-4 hover:bg-gray-50 dark:hover:bg-[#333] cursor-pointer flex items-center justify-center gap-2 transition-all group">
                    <ImageIcon size={18} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
                    <span className="text-xs text-gray-500 font-medium">Upload and resize image</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                  </label>
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 dark:bg-[#333] flex justify-end gap-3">
              <button 
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddPrompt}
                disabled={!newPrompt.title || !newPrompt.content || !newPrompt.categoryId}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-semibold shadow-lg shadow-blue-500/20 transition-all transform active:scale-95"
              >
                Save Prompt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Import Backup Options */}
      {showImportModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-[#2d2d2d] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold mb-2">Import Backup</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                We found <strong>{importData?.prompts.length}</strong> prompts and <strong>{importData?.categories.length}</strong> categories. How would you like to proceed?
              </p>
              
              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => finalizeImport('merge')}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/20"
                >
                  <Layers size={18} />
                  Merge with Existing
                </button>
                <button 
                  onClick={() => finalizeImport('overwrite')}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white p-3 rounded-xl font-semibold transition-all shadow-lg shadow-red-500/20"
                >
                  <RefreshCcw size={18} />
                  Overwrite Everything
                </button>
                <button 
                  onClick={() => { setShowImportModal(false); setImportData(null); }}
                  className="w-full p-3 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
