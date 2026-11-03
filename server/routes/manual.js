import {can} from '../../shared/accessPolicy.js';
import {cleanManualHtml,cleanManualContent,cleanManualResponse} from '../lib/manualHtml.js';
import {pdfBranding} from '../lib/branding.js';
import {escapeHtml,brandFileStem} from '../../shared/branding.js';
import express from 'express';
import { dbFetch, dbInsert, dbUpdate, dbDelete, dbFetchOne, supabase, supabaseAdmin } from '../lib/supabase.js';
import { verifyToken } from '../middleware/auth.js';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const router = express.Router();
router.use(verifyToken);
router.use((req,res,next)=>{const json=res.json.bind(res);res.json=value=>json(cleanManualResponse(value));next();});

function requireManualEditor(req,res,next){
 if(can(req.user,'manual','edit'))return next();
 return res.status(403).json({error:'The owner has not granted Manual Edit.'});
}
const requireManualPublisher=requireManualEditor;

// GET /api/manual/public - Get categories and published articles
router.get('/public', async (req, res) => {
  try {
    const { data: categories } = await supabase.from('hrm_manual_categories').select('*').order('order_index');
    const { data: articles } = await supabase.from('hrm_manual_articles')
      .select('id, category_id, title, published_content, version, order_index, updated_at')
      .eq('status', 'published')
      .order('order_index');
      
    res.json({ categories: categories || [], articles: articles || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/manual/admin - Get all for editors
router.get('/admin', requireManualEditor, async (req, res) => {
  try {
    const { data: categories } = await supabase.from('hrm_manual_categories').select('*').order('order_index');
    const { data: articles } = await supabase.from('hrm_manual_articles')
      .select('*')
      .neq('status', 'deleted')
      .order('order_index');
    res.json({ categories: categories || [], articles: articles || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/manual/categories
router.post('/categories', requireManualEditor, async (req, res) => {
  try {
    const { name, order_index } = req.body;
    const cat = await dbInsert('hrm_manual_categories', { name, order_index: order_index || 0 });
    res.json({ success: true, category: cat });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/manual/categories/:id
router.put('/categories/:id', requireManualEditor, async (req, res) => {
  try {
    const { name, order_index } = req.body;
    const cat = await dbUpdate('hrm_manual_categories', req.params.id, { name, order_index });
    res.json({ success: true, category: cat });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/manual/articles
router.post('/articles', requireManualEditor, async (req, res) => {
  try {
    const { category_id, title, draft_content, order_index } = req.body;
    const art = await dbInsert('hrm_manual_articles', { 
      category_id, 
      title, 
      draft_content: cleanManualContent(draft_content), 
      order_index: order_index || 0,
      status: 'draft',
      created_by: req.user.id,
      updated_by: req.user.id
    });
    res.json({ success: true, article: art });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/manual/articles/:id
router.put('/articles/:id', requireManualEditor, async (req, res) => {
  try {
    const { title, draft_content, order_index, category_id } = req.body;
    const updatePayload = { 
      updated_at: new Date().toISOString(),
      updated_by: req.user.id
    };
    if (title !== undefined) updatePayload.title = title;
    if (draft_content !== undefined) updatePayload.draft_content = cleanManualContent(draft_content);
    if (order_index !== undefined) updatePayload.order_index = order_index;
    if (category_id !== undefined) updatePayload.category_id = category_id;
    
    // Changing draft implies it's no longer matching published exactly if it was published
    updatePayload.status = 'draft';

    const art = await dbUpdate('hrm_manual_articles', req.params.id, updatePayload);
    res.json({ success: true, article: art });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/manual/articles/:id/publish
router.post('/articles/:id/publish', requireManualPublisher, async (req, res) => {
  try {
    const articleId = req.params.id;
    const art = await dbFetchOne('hrm_manual_articles', '*', { id: articleId });
    if (!art || art.status === 'deleted') return res.status(404).json({ error: 'Article not found' });

    // Save current published to history if it exists
    if (art.published_content) {
      await dbInsert('hrm_manual_versions', {
        article_id: articleId,
        content: cleanManualContent(art.published_content),
        version: art.version,
        created_by: req.user.id
      });
    }

    // Publish new
    const updated = await dbUpdate('hrm_manual_articles', articleId, {
      published_content: cleanManualContent(art.draft_content),
      status: 'published',
      version: art.version + 1,
      updated_at: new Date().toISOString(),
      published_by: req.user.id,
      published_at: new Date().toISOString()
    });

    res.json({ success: true, article: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/manual/articles/:id/versions
router.get('/articles/:id/versions', requireManualEditor, async (req, res) => {
  try {
    const { data: versions } = await supabase.from('hrm_manual_versions')
      .select('*, sys_users(full_name, username)')
      .eq('article_id', req.params.id)
      .order('version', { ascending: false });
    res.json({ versions: versions || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/manual/articles/:id/restore/:version
router.post('/articles/:id/restore/:version', requireManualEditor, async (req, res) => {
  try {
    const v = await dbFetchOne('hrm_manual_versions', '*', { article_id: req.params.id, version: req.params.version });
    if (!v) return res.status(404).json({ error: 'Version not found' });
    
    const updated = await dbUpdate('hrm_manual_articles', req.params.id, {
      draft_content: cleanManualContent(v.content),
      status: 'draft',
      updated_at: new Date().toISOString()
    });
    res.json({ success: true, article: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/manual/permissions
router.get('/permissions', async (req, res) => {
  try {
    if (!req.user.is_owner) {
      const perm = await dbFetchOne('hrm_manual_permissions', '*', { employee_id: req.user.employee_id });
      if (!perm?.can_manage_editors) return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const { data: perms } = await supabase.from('hrm_manual_permissions')
      .select('*, Employees(Full_name, employee_id)');
    res.json({ permissions: perms || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/manual/articles/:id/soft-delete
router.post('/articles/:id/soft-delete', requireManualEditor, async (req, res) => {
  try {
    const art = await dbFetchOne('hrm_manual_articles', '*', { id: req.params.id });
    if (!art) return res.status(404).json({ error: 'Article not found' });
    
    // Store original status in a custom field or simply assume it goes back to draft upon restore?
    // The requirement says: ACTIVE -> SOFT DELETE. We will just set status to 'deleted'.
    const updated = await dbUpdate('hrm_manual_articles', req.params.id, {
      status: 'deleted',
      updated_at: new Date().toISOString(),
      updated_by: req.user.id
    });
    res.json({ success: true, article: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/manual/recycle-bin
router.get('/recycle-bin', requireManualEditor, async (req, res) => {
  try {
    const { data: articles } = await supabase.from('hrm_manual_articles')
      .select('*, sys_users!updated_by(full_name, username)')
      .eq('status', 'deleted')
      .order('updated_at', { ascending: false });
    res.json({ articles: articles || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/manual/articles/:id/restore-deleted
router.post('/articles/:id/restore-deleted', requireManualEditor, async (req, res) => {
  try {
    const art = await dbFetchOne('hrm_manual_articles', '*', { id: req.params.id });
    if (!art || art.status !== 'deleted') return res.status(404).json({ error: 'Deleted article not found' });
    
    // Restore to draft
    const updated = await dbUpdate('hrm_manual_articles', req.params.id, {
      status: 'draft',
      updated_at: new Date().toISOString(),
      updated_by: req.user.id
    });
    res.json({ success: true, article: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/manual/articles/:id - Hard Delete
router.delete('/articles/:id', async (req, res) => {
  try {
    // Only Boss can hard delete (or an explicit Admin)
    if (!req.user.is_owner) {
      return res.status(403).json({ error: 'Only Boss/Admin can hard delete articles' });
    }
    
    const art = await dbFetchOne('hrm_manual_articles', '*', { id: req.params.id });
    if (!art) return res.status(404).json({ error: 'Article not found' });
    if (art.status !== 'deleted') return res.status(400).json({ error: 'Article must be in Recycle Bin to be hard deleted' });

    // Ensure we delete versions first to maintain integrity
    await supabase.from('hrm_manual_versions').delete().eq('article_id', req.params.id);
    
    // Now hard delete the article
    await dbDelete('hrm_manual_articles', req.params.id);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/manual/export/pdf - Export full manual as PDF
router.get('/export/pdf', async (req, res) => {
  let browser;
  try {
    const { data: categories } = await supabase.from('hrm_manual_categories').select('*').order('order_index');
    const { data: articles } = await supabase.from('hrm_manual_articles')
      .select('id, category_id, title, published_content, version')
      .eq('status', 'published')
      .order('order_index');

    const lang = req.query.language === 'my' ? 'my' : 'en';

    let translations = {};
    try {
      const localePath = path.join(process.cwd(), '../hrm-client/src/locales', lang, 'common.json');
      const rawLocale = fs.readFileSync(localePath, 'utf8');
      translations = JSON.parse(rawLocale).manual || {};
    } catch (e) {
      console.error('[PDF Export] Failed to load locale:', e.message);
    }

    const getTranslated = (keyName) => {
      if (!keyName) return '';
      const baseName = keyName.replace(/\s*\(.*\)\s*$/, '').trim();
      if (translations[baseName]) return translations[baseName];
      if (translations[baseName.toUpperCase()]) return translations[baseName.toUpperCase()];
      if (translations[baseName.toLowerCase()]) return translations[baseName.toLowerCase()];
      return baseName;
    };

    const extractContent = (contentRaw) => {
      if (!contentRaw) return '';
      try {
        const parsed = JSON.parse(contentRaw);
        return parsed[lang] || parsed.my || ''; 
      } catch(e) {
        return contentRaw;
      }
    };

    // Filter out categories typically excluded in public/dashboard views if needed
    const excludedKeywords = ['crm', 'employee portal', 'administration'];
    const filteredCategories = (categories || []).filter(c => {
      const lowerName = c.name?.toLowerCase() || '';
      return !excludedKeywords.some(kw => lowerName.includes(kw));
    });
    const excludedCategoryIds = (categories || []).filter(c => !filteredCategories.includes(c)).map(c => c.id);
    const filteredArticles = (articles || []).filter(a => !excludedCategoryIds.includes(a.category_id));

    const brand=await pdfBranding();
    const brandLogo=brand.logoBuffer?'<img alt="" style="width:72px;height:72px;object-fit:contain" src="data:'+brand.logo.mime+';base64,'+brand.logoBuffer.toString('base64')+'">':'';
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(brand.name)} HR User Manual</title>
        <style>
          700&display=swap');
          body { font-family: 'Padauk', 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; padding: 20px; }
          .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 80vh; text-align: center; }
          .cover h1 { font-size: 48px; margin-bottom: 10px; color: ${brand.accent}; }
          .cover h2 { font-size: 24px; color: #64748b; font-weight: normal; margin-bottom: 40px; }
          .cover p { font-size: 16px; color: #94a3b8; }
          .page-break { page-break-before: always; }
          .toc { margin-top: 50px; }
          .toc h2 { font-size: 28px; color: ${brand.accent}; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 20px; }
          .toc-category { font-size: 18px; font-weight: bold; margin-top: 15px; }
          .toc-article { font-size: 16px; margin-left: 20px; color: #475569; padding: 2px 0; }
          .category-title { font-size: 32px; color: ${brand.accent}; border-bottom: 3px solid #e2e8f0; padding-bottom: 10px; margin-top: 40px; margin-bottom: 20px; }
          .article-title { font-size: 24px; color: #334155; margin-top: 40px; margin-bottom: 15px; }
          .content { font-size: 14px; }
          .content img { max-width: 100%; height: auto; border-radius: 4px; margin: 10px 0; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
          th { background-color: #f8fafc; font-weight: bold; }
          ul, ol { margin-bottom: 15px; }
          p { margin-bottom: 15px; }
        </style>
      </head>
      <body>
        <div class="cover">
          ${brandLogo}<h1>${escapeHtml(brand.name)} HR User Manual</h1>
          <h2>HRM / Corporate HR Automation System</h2>
          <p>Generated on ${new Date().toLocaleDateString()}</p>
        </div>
        <div class="page-break"></div>
        
        <div class="toc">
          <h2>Table of Contents</h2>
    `;

    filteredCategories.forEach(cat => {
      const catArticles = filteredArticles.filter(a => a.category_id === cat.id);
      if (catArticles.length > 0) {
        html += `<div class="toc-category">${escapeHtml(getTranslated(cat.name))}</div>`;
        catArticles.forEach(a => {
          html += `<div class="toc-article">• ${escapeHtml(getTranslated(a.title))}</div>`;
        });
      }
    });

    html += `</div>`;

    filteredCategories.forEach(cat => {
      const catArticles = filteredArticles.filter(a => a.category_id === cat.id);
      if (catArticles.length > 0) {
        html += `<div class="page-break"></div>`;
        html += `<h1 class="category-title">${escapeHtml(getTranslated(cat.name))}</h1>`;
        
        catArticles.forEach(a => {
          html += `<h2 class="article-title">${escapeHtml(getTranslated(a.title))}</h2>`;
          html += `<div class="content">${cleanManualHtml(extractContent(a.published_content))}</div>`;
        });
      }
    });

    html += `
      </body>
      </html>
    `;

    browser = await puppeteer.launch({ 
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request',r=>r.url().startsWith('data:')?r.continue():r.abort());
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '40px', right: '40px', bottom: '40px', left: '40px' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: '<div style="font-size:10px; width:100%; text-align:center; color:#94a3b8; font-family: sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
    });
    await browser.close();
    browser = null;

    const fileName = brandFileStem(brand.name)+'_User_Manual_'+lang.toUpperCase()+'.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="HR_User_Manual.pdf"; filename*=UTF-8\'\''+encodeURIComponent(fileName));
    res.send(Buffer.from(pdfBuffer));
  } catch (e) {
    console.error('[PDF Export Error]', e);
    res.status(500).json({ error: e.message });
  } finally { if(browser)await browser.close(); }
});

export default router;
