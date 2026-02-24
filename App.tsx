
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
  AlertCircle,
  Cpu,
  Package,
  FileCode,
  ArrowRight,
  Terminal as TerminalIcon,
  Apple
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

  // Parent Category selection for subfolder creation
  const [addParentId, setAddParentId] = useState<string | undefined>(undefined);

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
    if (categories.length <= 1 && !categories.find(c => c.id === id)?.parentId) {
      alert("You must have at least one root category.");
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

  // Fixed handleEmptyTrash by adding closing brace and confirmation logic
  const handleEmptyTrash = () => {
    if (confirm('Are you sure you want to permanently delete all items in the trash?')) {
      setPrompts(prompts.filter(p => p.categoryId !== TRASH_CATEGORY_ID));
    }
  };

  const handleCopyPrompt = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleGeneratePython = async () => {
    setIsGenerating(true);
    setViewMode(ViewMode.PYTHON_EXPORT);
    try {
      const code = await generatePythonScript(categories, prompts);
      setPythonCode(code || '');
    } catch (error) {
      alert("Failed to generate Python code. Check console for details.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await resizeImage(file);
      setNewPrompt({ ...newPrompt, image: base64 });
    }
  };

  // Effect to handle sub-folder creation when addParentId changes
  useEffect(() => {
    if (addParentId) {
      handleAddCategory(addParentId);
      setAddParentId(undefined);
    }
  }, [addParentId]);

  // Render categories recursively
  const renderCategoryItem = (cat: Category, depth: number = 0) => {
    const hasChildren = categories.some(c => c.parentId === cat.id);
    const isExpanded = expandedCategories.has(cat.id);
    const isActive = activeCategoryId === cat.id;

    return (
      <div key={cat.id} className="select-none">
        <div 
          className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors ${
            isActive ? 'bg-pink-100 text-pink-700' : 'text-gray-600 hover:bg-gray-100'
          } ${dragOverCategoryId === cat.id ? 'ring-2 ring-pink-400' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => setActiveCategoryId(cat.id)}
          onDragOver={(e) => handleDragOver(e, cat.id)}
          onDragLeave={() => setDragOverCategoryId(null)}
          onDrop={(e) => handleDrop(e, cat.id)}
        >
          {hasChildren ? (
            <button onClick={(e) => toggleExpand(cat.id, e)} className="p-1 hover:bg-white/50 rounded mr-1">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : <Folder size={14} className="mr-2" />}
          
          {editingCategoryId === cat.id ? (
            <input
              autoFocus
              className="bg-white border border-gray-300 rounded px-1 w-full focus:outline-none focus:ring-1 focus:ring-pink-500"
              value={editCategoryName}
              onChange={e => setEditCategoryName(e.target.value)}
              onBlur={() => handleRenameCategory(cat.id)}
              onKeyDown={e => e.key === 'Enter' && handleRenameCategory(cat.id)}
            />
          ) : (
            <span className="flex-1 truncate">{cat.name}</span>
          )}

          <div className="hidden group-hover:flex items-center gap-1 ml-2">
            <button onClick={(e) => { e.stopPropagation(); setAddParentId(cat.id); }} title="Add sub-folder">
              <Plus size={14} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setEditingCategoryId(cat.id); setEditCategoryName(cat.name); }} title="Rename">
              <Edit2 size={12} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }} title="Delete">
              <Trash2 size={12} className="text-red-400" />
            </button>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div className="mt-1">
            {categories.filter(c => c.parentId === cat.id).map(c => renderCategoryItem(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Layout className="text-pink-500" /> PromptArchive
          </h1>
          <button 
            onClick={() => handleAddCategory()}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
          >
            <FolderPlus size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <div 
            className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg cursor-pointer mb-2 ${
              activeCategoryId === ALL_CATEGORY_ID ? 'bg-pink-100 text-pink-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
            onClick={() => setActiveCategoryId(ALL_CATEGORY_ID)}
          >
            <Layers size={18} className="mr-3" /> All Prompts
          </div>

          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2 mt-6">Collections</div>
          {categories.filter(c => !c.parentId).map(c => renderCategoryItem(c))}

          <div className="pt-8">
            <div 
              className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg cursor-pointer ${
                activeCategoryId === TRASH_CATEGORY_ID ? 'bg-red-50 text-red-600' : 'text-gray-500 hover:bg-red-50 hover:text-red-600'
              }`}
              onClick={() => setActiveCategoryId(TRASH_CATEGORY_ID)}
            >
              <Trash2 size={18} className="mr-3" /> Trash
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-gray-100 space-y-2">
          <button 
            onClick={handleExportBackup}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
          >
            <Download size={16} /> Export JSON
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
          >
            <Upload size={16} /> Import JSON
          </button>
          <input ref={fileInputRef} type="file" className="hidden" accept=".json" onChange={handleImportFileSelect} />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-white">
        {/* Header */}
        <header className="h-16 border-b border-gray-100 px-6 flex items-center justify-between bg-white z-10">
          <div className="flex-1 max-w-xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search prompts..." 
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border-transparent focus:bg-white focus:border-pink-300 rounded-xl text-sm transition-all focus:ring-0"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <select 
              className="text-sm bg-gray-50 border-none rounded-lg py-2 pl-3 pr-8 focus:ring-0 cursor-pointer hover:bg-gray-100"
              value={sortOption}
              onChange={e => setSortOption(e.target.value as SortOption)}
            >
              <option value={SortOption.NEWEST}>Newest first</option>
              <option value={SortOption.OLDEST}>Oldest first</option>
              <option value={SortOption.TITLE_ASC}>A-Z</option>
              <option value={SortOption.TITLE_DESC}>Z-A</option>
            </select>
            
            <button 
              onClick={handleGeneratePython}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-all shadow-sm active:scale-95"
            >
              <Terminal size={18} /> Export as Desktop App
            </button>

            <button 
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-xl text-sm font-medium hover:bg-pink-600 transition-all shadow-md active:scale-95"
            >
              <Plus size={18} /> New Prompt
            </button>
          </div>
        </header>

        {/* Prompt Grid */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
          {activeCategoryId === TRASH_CATEGORY_ID && filteredAndSortedPrompts.length > 0 && (
            <div className="mb-6 flex justify-between items-center bg-red-50 p-4 rounded-xl border border-red-100">
              <span className="text-sm text-red-700 font-medium flex items-center gap-2">
                <AlertCircle size={16} /> Items in trash are deleted permanently when you empty it.
              </span>
              <button 
                onClick={handleEmptyTrash}
                className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 font-bold uppercase tracking-wider"
              >
                Empty Trash Now
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredAndSortedPrompts.map(prompt => (
              <div 
                key={prompt.id}
                draggable
                onDragStart={(e) => handleDragStart(e, prompt.id)}
                className="group bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-xl hover:border-pink-200 transition-all cursor-move flex flex-col h-full"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-gray-800 line-clamp-1">{prompt.title}</h3>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {prompt.categoryId === TRASH_CATEGORY_ID ? (
                      <button 
                        onClick={() => handleRestorePrompt(prompt.id)}
                        className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg"
                        title="Restore"
                      >
                        <RefreshCcw size={16} />
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleCopyPrompt(prompt.id, prompt.content)}
                        className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg"
                        title="Copy text"
                      >
                        {copiedId === prompt.id ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    )}
                    <button 
                      onClick={() => handleDeletePrompt(prompt.id)}
                      className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg"
                      title={prompt.categoryId === TRASH_CATEGORY_ID ? "Delete Permanently" : "Move to Trash"}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {prompt.image && (
                  <div className="mb-4 rounded-lg overflow-hidden h-32 bg-gray-100">
                    <img src={prompt.image} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                
                <p className="text-sm text-gray-600 line-clamp-4 flex-1 mb-4 italic leading-relaxed">
                  "{prompt.content}"
                </p>

                <div className="flex items-center justify-between pt-4 border-t border-gray-50 mt-auto">
                  <span className="text-[10px] text-gray-400 font-medium">
                    {new Date(prompt.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-md">
                    <Folder size={10} className="text-gray-400" />
                    <span className="text-[10px] text-gray-500 font-bold max-w-[80px] truncate">
                      {categories.find(c => c.id === prompt.categoryId)?.name || 'Uncategorized'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredAndSortedPrompts.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 py-20">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <Search size={40} className="text-gray-200" />
              </div>
              <p className="text-lg font-medium">No prompts found</p>
              <p className="text-sm">Try adjusting your search or selection</p>
            </div>
          )}
        </div>

        {/* Add Modal */}
        {isAdding && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold text-gray-900">Create New Prompt</h2>
                  <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-gray-100 rounded-full">
                    <X size={24} className="text-gray-400" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Title</label>
                    <input 
                      autoFocus
                      type="text" 
                      placeholder="e.g. Creative Writer Persona"
                      className="w-full px-4 py-3 bg-gray-50 border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:bg-white transition-all outline-none"
                      value={newPrompt.title}
                      onChange={e => setNewPrompt({ ...newPrompt, title: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Collection</label>
                    <select 
                      className="w-full px-4 py-3 bg-gray-50 border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:bg-white transition-all outline-none appearance-none"
                      value={newPrompt.categoryId}
                      onChange={e => setNewPrompt({ ...newPrompt, categoryId: e.target.value })}
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Prompt Content</label>
                    <textarea 
                      rows={6}
                      placeholder="Type your prompt here..."
                      className="w-full px-4 py-3 bg-gray-50 border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:bg-white transition-all outline-none resize-none"
                      value={newPrompt.content}
                      onChange={e => setNewPrompt({ ...newPrompt, content: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Thumbnail (Optional)</label>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => document.getElementById('imageUpload')?.click()}
                        className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-200 rounded-xl hover:border-pink-300 hover:bg-pink-50 transition-all group"
                      >
                        <ImageIcon size={20} className="text-gray-400 group-hover:text-pink-500" />
                        <span className="text-sm font-medium text-gray-500 group-hover:text-pink-600">Upload Image</span>
                      </button>
                      {newPrompt.image && (
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden shadow-sm ring-2 ring-pink-500 ring-offset-2">
                          <img src={newPrompt.image} className="w-full h-full object-cover" alt="" />
                          <button 
                            onClick={() => setNewPrompt({...newPrompt, image: ''})}
                            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                          >
                            <X size={12} className="text-white" />
                          </button>
                        </div>
                      )}
                      <input id="imageUpload" type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-8 py-6 flex justify-end gap-3 border-t border-gray-100">
                <button 
                  onClick={() => setIsAdding(false)}
                  className="px-6 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddPrompt}
                  disabled={!newPrompt.title || !newPrompt.content}
                  className="px-8 py-2.5 bg-pink-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-pink-200 hover:bg-pink-600 active:scale-95 disabled:opacity-50 disabled:shadow-none transition-all"
                >
                  Save Prompt
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Python Export Modal/View */}
        {viewMode === ViewMode.PYTHON_EXPORT && (
          <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-right duration-300">
            <div className="h-16 border-b border-gray-100 px-6 flex items-center justify-between bg-white">
              <div className="flex items-center gap-4">
                <button onClick={() => setViewMode(ViewMode.MANAGE)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={24} />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-white">
                    <Terminal size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Desktop App Generator</h2>
                    <p className="text-xs text-gray-500">Creating PyQt6 application with Gemini Pro</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleCopyPrompt('py', pythonCode)}
                  disabled={!pythonCode}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-all"
                >
                  {copiedId === 'py' ? <Check size={18} /> : <Copy size={18} />}
                  Copy Code
                </button>
                <button 
                  onClick={() => {
                    const blob = new Blob([pythonCode], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'prompt_manager.py';
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                  disabled={!pythonCode}
                  className="flex items-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-xl text-sm font-medium hover:bg-pink-600 transition-all shadow-md"
                >
                  <Download size={18} /> Download .py
                </button>
              </div>
            </div>

            <div className="flex-1 p-6 bg-gray-900 overflow-hidden flex flex-col">
              {isGenerating ? (
                <div className="flex-1 flex flex-col items-center justify-center text-white space-y-6">
                  <div className="relative">
                    <div className="w-24 h-24 border-4 border-pink-500/20 rounded-full animate-pulse"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <RefreshCcw className="animate-spin text-pink-500" size={40} />
                    </div>
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-bold mb-2">Gemini is writing your code...</h3>
                    <p className="text-gray-400 text-sm max-w-sm">Designing macOS Sonoma interface, setting up SQLite integration, and embedding your initial data.</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 bg-black/30 rounded-2xl border border-white/10 overflow-hidden flex flex-col shadow-2xl">
                  <div className="bg-white/5 px-4 py-2 flex items-center gap-2 border-b border-white/5">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                      <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
                    </div>
                    <span className="text-xs text-gray-500 font-mono ml-4 uppercase tracking-widest">prompt_manager.py</span>
                  </div>
                  <pre className="flex-1 overflow-auto p-6 text-pink-300 font-mono text-sm leading-relaxed scrollbar-thin scrollbar-thumb-white/10">
                    {pythonCode || "# No code generated yet."}
                  </pre>
                </div>
              )}
            </div>

            <div className="bg-gray-50 p-6 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 flex-shrink-0">
                  <Cpu size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-800">macOS Native</h4>
                  <p className="text-xs text-gray-500">Optimized for Apple Silicon & Intel Macs using PyQt6.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-green-600 flex-shrink-0">
                  <Package size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-800">Self-Contained</h4>
                  <p className="text-xs text-gray-500">Includes SQLite DB setup and all your current prompts.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 flex-shrink-0">
                  <Apple size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-800">Sonoma Design</h4>
                  <p className="text-xs text-gray-500">Modern QSS theme matching latest macOS visual language.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Import Modal */}
        {showImportModal && importData && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-8 overflow-hidden">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-pink-100 rounded-2xl flex items-center justify-center text-pink-600">
                  <RefreshCcw size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Import Backup</h2>
                  <p className="text-sm text-gray-500">Found {importData.prompts.length} prompts & {importData.categories.length} folders.</p>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <button 
                  onClick={() => finalizeImport('merge')}
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-left hover:border-pink-300 transition-all flex items-center justify-between group"
                >
                  <div>
                    <h3 className="font-bold text-gray-800">Merge with existing</h3>
                    <p className="text-xs text-gray-500 mt-1">Keep current data and add new items from file.</p>
                  </div>
                  <ArrowRight size={20} className="text-gray-300 group-hover:text-pink-500 group-hover:translate-x-1 transition-all" />
                </button>
                <button 
                  onClick={() => finalizeImport('overwrite')}
                  className="w-full p-4 bg-red-50 border border-red-100 rounded-2xl text-left hover:border-red-300 transition-all flex items-center justify-between group"
                >
                  <div>
                    <h3 className="font-bold text-red-800">Overwrite everything</h3>
                    <p className="text-xs text-red-600/70 mt-1">Delete current data and replace with backup contents.</p>
                  </div>
                  <X size={20} className="text-red-300 group-hover:text-red-500 transition-all" />
                </button>
              </div>

              <button 
                onClick={() => { setShowImportModal(false); setImportData(null); }}
                className="w-full py-3 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancel Import
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
