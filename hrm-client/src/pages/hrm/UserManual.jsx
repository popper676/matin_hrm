import SystemGuide from '../../components/manual/SystemGuide';
import {cleanManualHtml} from '../../utils/manualHtml.js';
import {useBrand} from '../../context/BrandContext';
import {brandFileStem} from '../../../../shared/branding.js';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import toast from 'react-hot-toast';
import RichTextEditor from '../../components/manual/RichTextEditor';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

export default function UserManual() {
  const {brand}=useBrand();
  const { user,can } = useAuth();
  const { language, t } = useLanguage();
  const [activeArticle, setActiveArticle] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: null, articleId: null, articleTitle: '' });

  const queryClient = useQueryClient();
  const isBossOrAdmin=!!user?.is_owner;
  const canEdit=can('manual','edit');
  const canPublish=canEdit;

  // Fetch Manual Data (Public or Admin view based on permissions)
  const endpoint = canEdit ? '/manual/admin' : '/manual/public';
  const { data } = useQuery({
    queryKey: ['manual-data', endpoint],
    queryFn: async () => {
      const res = await api.get(endpoint);
      return res.data;
    }
  });

  const allCategories = data?.categories || [];
  const allArticles = data?.articles || [];
  const excludedCategoryKeywords = ['crm', 'employee portal', 'administration'];
  const excludedCategoryIds = allCategories.filter(c => {
    const lowerName = c.name?.toLowerCase() || '';
    return excludedCategoryKeywords.some(kw => lowerName.includes(kw));
  }).map(c => c.id);

  const categories = allCategories.filter(c => !excludedCategoryIds.includes(c.id));
  const articles = allArticles.filter(a => !excludedCategoryIds.includes(a.category_id));

  const getTranslated = (keyName) => {
    if (!keyName) return '';
    // Strip trailing parentheses like "(Customer Relationship Management)"
    const baseName = keyName.replace(/\s*\(.*\)\s*$/, '').trim();

    let key = `common.manual.${baseName}`;
    let res = t(key);
    if (res !== key) return res;

    key = `common.manual.${baseName.toUpperCase()}`;
    res = t(key);
    if (res !== key) return res;

    key = `common.manual.${baseName.toLowerCase()}`;
    res = t(key);
    if (res !== key) return res;

    return baseName;
  };

  const { data: recycleData } = useQuery({
    queryKey: ['manual-recycle-bin'],
    queryFn: async () => {
      const res = await api.get('/manual/recycle-bin');
      return res.data;
    },
    enabled: !!canEdit
  });
  const deletedArticles = recycleData?.articles || [];

  // Mutations
  const updateArticle = useMutation({
    mutationFn: (data) => api.put(`/manual/articles/${data.id}`, data),
    onSuccess: () => {
      toast.success('Saved draft successfully');
      queryClient.invalidateQueries({queryKey:['manual-data']});
    }
  });

  const publishArticle = useMutation({
    mutationFn: (id) => api.post(`/manual/articles/${id}/publish`),
    onSuccess: () => {
      toast.success('Published successfully');
      queryClient.invalidateQueries({queryKey:['manual-data']});
      setIsEditing(false);
    }
  });

  const addCategory = useMutation({
    mutationFn: (name) => api.post('/manual/categories', { name }),
    onSuccess: () => {
      toast.success('Category added');
      queryClient.invalidateQueries({queryKey:['manual-data']});
    }
  });

  const addArticle = useMutation({
    mutationFn: (catId) => api.post('/manual/articles', { category_id: catId, title: 'New Article', draft_content: '' }),
    onSuccess: (res) => {
      toast.success('Article added');
      queryClient.invalidateQueries({queryKey:['manual-data']});
      setActiveArticle(res.data.article);
      setIsEditing(true);
    }
  });

  const softDeleteArticle = useMutation({
    mutationFn: (id) => api.post(`/manual/articles/${id}/soft-delete`),
    onSuccess: () => {
      toast.success('Article moved to Recycle Bin');
      queryClient.invalidateQueries({queryKey:['manual-data']});
      queryClient.invalidateQueries({queryKey:['manual-recycle-bin']});
      setActiveArticle(null);
      setIsEditing(false);
      setConfirmModal({ isOpen: false });
    }
  });

  const restoreArticle = useMutation({
    mutationFn: (id) => api.post(`/manual/articles/${id}/restore-deleted`),
    onSuccess: (res) => {
      toast.success('Article restored');
      queryClient.invalidateQueries({queryKey:['manual-data']});
      queryClient.invalidateQueries({queryKey:['manual-recycle-bin']});
      setActiveArticle(res.data.article);
    }
  });

  const hardDeleteArticle = useMutation({
    mutationFn: (id) => api.delete(`/manual/articles/${id}`),
    onSuccess: () => {
      toast.success('Article permanently deleted');
      queryClient.invalidateQueries({queryKey:['manual-recycle-bin']});
      setActiveArticle(null);
      setConfirmModal({ isOpen: false });
    }
  });

  // Filter articles based on search
  const filteredArticles = articles.filter(a => {
    const locTitle = getTranslated(a.title);
    return locTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.published_content && a.published_content.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  const handleContentClick = (e) => {
    // Traverse up to find an anchor tag in case they clicked an element inside the a tag
    const anchor = e.target.closest('a');
    if (anchor) {
      const articleTitle = anchor.getAttribute('data-article-title');
      if (articleTitle) {
        e.preventDefault();
        const targetArticle = articles.find(a => a.title === articleTitle);
        if (targetArticle) {
          setActiveArticle(targetArticle);
          setIsEditing(false);
        } else {
          toast.error('Article not found: ' + articleTitle);
        }
      }
    }
  };

  const getLocalizedContent = (content) => {
    if (!content) return '';
    try {
      const parsed = JSON.parse(content);
      return parsed[language] || parsed.my || '';
    } catch {
      return content;
    }
  };

  const updateLocalizedContent = (originalContent, newLanguageContent) => {
    try {
      const parsed = JSON.parse(originalContent || '{}');
      parsed[language] = newLanguageContent;
      return JSON.stringify(parsed);
    } catch {
      // If it wasn't JSON before, treat old content as 'my' (Myanmar)
      const parsed = { my: originalContent || '' };
      parsed[language] = newLanguageContent;
      return JSON.stringify(parsed);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      toast.loading(t('common.manual.generatingPdf') || 'Generating PDF...', { id: 'pdf-download' });
      const response = await api.get('/manual/export/pdf', {
        params: { language },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      const fileName = brandFileStem(brand.name)+'_User_Manual_'+language.toUpperCase()+'.pdf';
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success(t('common.manual.pdfDownloaded') || 'PDF downloaded successfully', { id: 'pdf-download' });
    } catch (err) {
      console.error('PDF download error:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        toast.error(t('common.manual.unauthorizedPdf') || 'Unauthorized to download PDF', { id: 'pdf-download' });
      } else {
        toast.error(t('common.manual.pdfDownloadError') || 'Failed to download PDF', { id: 'pdf-download' });
      }
    }
  };

  return (
    <><SystemGuide/>
    <div className="manual-workspace flex h-[calc(100vh-100px)] bg-surface-800 rounded-lg shadow overflow-hidden">
      {/* Article browser */}
      <section className="manual-index border-b border-white/10 flex flex-col bg-surface-850">
        <div className="p-4 border-b border-white/10 space-y-3">
          <input
            type="text"
            placeholder={t('common.manual.searchPlaceholder')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border rounded-md bg-surface-900 border-white/20 dashboard-text-primary placeholder-slate-400 font-bold focus:outline-none focus:border-brand-green transition-colors shadow-sm"
          />
          <button
            onClick={handleDownloadPdf}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-brand-green/10 hover:bg-brand-green/20 text-brand-green border border-brand-green/20 rounded-md text-sm font-bold transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PDF Manual
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {categories.map(cat => (
            <div key={cat.id} className="mb-4">
              <h3 className="font-extrabold dashboard-text-primary px-2 py-1 uppercase text-xs tracking-wider flex justify-between group">
                {getTranslated(cat.name)}
                {canEdit && (
                  <button onClick={() => addArticle.mutate(cat.id)} className="hidden group-hover:block text-blue-500 hover:text-blue-700 text-lg leading-none">+</button>
                )}
              </h3>
              <ul className="mt-1 space-y-1">
                {filteredArticles.filter(a => a.category_id === cat.id).map(art => (
                  <li key={art.id}>
                    <button
                      onClick={() => {
                        setActiveArticle(art);
                        setIsEditing(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                        activeArticle?.id === art.id
                          ? 'bg-brand-green text-slate-900 font-extrabold shadow-md'
                          : 'dashboard-text-primary font-bold hover:bg-white/10 opacity-90 hover:opacity-100'
                      }`}
                    >
                      {getTranslated(art.title)}
                      {canEdit && art.status === 'draft' && <span className="ml-2 text-xs text-orange-500">{t('common.manual.draftLabel')}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {canEdit && (
            <button
              onClick={() => {
                const name = prompt(t('common.manual.categoryNamePrompt'));
                if (name) addCategory.mutate(name);
              }}
              className="mt-4 w-full text-left px-3 py-2 text-sm text-indigo-400 hover:bg-white/5 rounded-md"
            >
              {t('common.manual.addCategory')}
            </button>
          )}

          {canEdit && deletedArticles.length > 0 && (
            <div className="mb-4 mt-8 pt-4 border-t border-white/10">
              <h3 className="font-extrabold dashboard-text-primary px-2 py-1 uppercase text-xs tracking-wider flex items-center gap-2">
                <svg className="w-3.5 h-3.5 dashboard-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                {t('common.manual.recycleBin')}
              </h3>
              <ul className="mt-1 space-y-1">
                {deletedArticles.map(art => (
                  <li key={art.id}>
                    <button
                      onClick={() => {
                        setActiveArticle(art);
                        setIsEditing(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                        activeArticle?.id === art.id
                          ? 'bg-rose-500 text-white font-extrabold shadow-md'
                          : 'dashboard-text-secondary font-bold hover:bg-surface-800'
                      }`}
                    >
                      <span className="opacity-90">{getTranslated(art.title)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeArticle ? (
          <>
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-surface-800">
              {isEditing ? (
                <input
                  type="text"
                  value={activeArticle.title}
                  onChange={e => setActiveArticle({...activeArticle, title: e.target.value})}
                  className="text-2xl font-bold border-b border-white/20 focus:outline-none focus:border-blue-500 bg-transparent text-white"
                />
              ) : (
                <h2 className="text-2xl font-bold text-white">{getTranslated(activeArticle.title)}</h2>
              )}

              <div className="flex gap-2 items-center">
                {activeArticle.status === 'deleted' ? (
                  <>
                    <button
                      onClick={() => restoreArticle.mutate(activeArticle.id)}
                      disabled={restoreArticle.isPending}
                      className="px-4 py-2 bg-surface-850 border border-slate-700 text-slate-300 rounded hover:bg-slate-800 hover:text-white transition-colors flex items-center gap-2 text-sm font-semibold"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      {t('common.manual.restore')}
                    </button>
                    {isBossOrAdmin && (
                      <button
                        onClick={() => setConfirmModal({ isOpen: true, type: 'hard', articleId: activeArticle.id, articleTitle: activeArticle.title })}
                        disabled={hardDeleteArticle.isPending}
                        className="px-4 py-2 bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded hover:bg-rose-500/20 transition-colors flex items-center gap-2 text-sm font-semibold"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        {t('common.manual.hardDelete')}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {canEdit && !isEditing && (
                      <>
                        <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-white/5 text-slate-200 hover:bg-white/10 rounded transition-colors text-sm font-semibold">
                          {t('common.manual.edit')}
                        </button>
                        <button
                          onClick={() => setConfirmModal({ isOpen: true, type: 'soft', articleId: activeArticle.id, articleTitle: activeArticle.title })}
                          className="px-4 py-2 bg-rose-500/10 text-rose-400 rounded hover:bg-rose-500/20 transition-colors text-sm font-semibold flex items-center gap-1.5"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          {t('common.manual.delete')}
                        </button>
                      </>
                    )}
                    {isEditing && (
                      <>
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            queryClient.invalidateQueries({queryKey:['manual-data']}); // cancel changes
                          }}
                          className="px-4 py-2 text-slate-300 hover:bg-white/5 rounded transition-colors text-sm font-semibold"
                        >
                          {t('common.manual.cancel')}
                        </button>
                        <button
                          onClick={() => updateArticle.mutate({ id: activeArticle.id, title: activeArticle.title, draft_content: activeArticle.draft_content })}
                          className="px-4 py-2 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded transition-colors text-sm font-semibold"
                        >
                          {t('common.manual.saveDraft')}
                        </button>
                        {canPublish && (
                          <button
                            onClick={() => publishArticle.mutate(activeArticle.id)}
                            className="px-4 py-2 bg-emerald-500 text-white hover:bg-emerald-600 rounded shadow transition-colors text-sm font-semibold"
                          >
                            {t('common.manual.publish')}
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-surface-850">
              {isEditing ? (
                <div className="h-full">
                  <RichTextEditor
                    value={getLocalizedContent(activeArticle.draft_content || activeArticle.published_content)}
                    onChange={(val) => setActiveArticle({
                      ...activeArticle,
                      draft_content: updateLocalizedContent(activeArticle.draft_content || activeArticle.published_content, val)
                    })}
                  />
                </div>
              ) : (
                <div
                  className="prose prose-invert max-w-4xl"
                  onClick={handleContentClick}
                  dangerouslySetInnerHTML={{ __html: cleanManualHtml(getLocalizedContent(activeArticle.published_content) || `<p class="text-slate-400 italic">${t('common.manual.noContent')}</p>`) }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            {t('common.manual.selectArticle')}
          </div>
        )}
      </div>

      {/* Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmModal({ isOpen: false })}
          />
          <div className="relative bg-surface-800 border border-white/10 rounded-2xl w-full max-w-sm m-4 p-6 shadow-2xl text-center">
            <button
              onClick={() => setConfirmModal({ isOpen: false })}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <div className={`w-14 h-14 flex items-center justify-center rounded-full mx-auto mb-4 ${
              confirmModal.type === 'hard'
                ? 'bg-rose-500/10 text-rose-500'
                : 'bg-amber-500/10 text-amber-500'
            }`}>
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>

            <h2 className="text-lg font-bold text-slate-200 mb-2">
              {confirmModal.type === 'hard' ? t('common.manual.permanentlyDeleteTitle') : t('common.manual.moveToRecycleBinTitle')}
            </h2>

            <div className="text-sm text-slate-400 mb-6 space-y-2">
              {confirmModal.type === 'hard' ? (
                <>
                  <p>{t('common.manual.aboutToDelete')}<br/><strong className="text-white">"{getTranslated(confirmModal.articleTitle)}"</strong>.</p>
                  <p className="text-rose-400 text-xs font-medium">{t('common.manual.cannotBeUndone')}</p>
                </>
              ) : (
                <>
                  <p>{t('common.manual.areYouSureMove')}<br/><strong className="text-white">"{getTranslated(confirmModal.articleTitle)}"</strong> {t('common.manual.toRecycleBin')}</p>
                  <p className="text-xs">{t('common.manual.canRestoreLater')}</p>
                </>
              )}
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={() => setConfirmModal({ isOpen: false })}
                className="flex-1 px-4 py-2.5 bg-surface-900 hover:bg-white/5 text-slate-300 font-semibold rounded-xl transition-colors"
              >
                {t('common.manual.cancel')}
              </button>
              <button
                onClick={() => {
                  if (confirmModal.type === 'hard') {
                    hardDeleteArticle.mutate(confirmModal.articleId);
                  } else {
                    softDeleteArticle.mutate(confirmModal.articleId);
                  }
                }}
                disabled={softDeleteArticle.isPending || hardDeleteArticle.isPending}
                className={`flex-1 px-4 py-2.5 font-bold rounded-xl transition-colors text-white ${
                  confirmModal.type === 'hard'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {confirmModal.type === 'hard' ? t('common.manual.permanentlyDeleteBtn') : t('common.manual.moveToRecycleBinBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div></>
  );
}
