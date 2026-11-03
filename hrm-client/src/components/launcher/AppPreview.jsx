import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import Modal from '../experience/Modal';
import Icon from '../common/Icon';
import AppGlyph from './AppGlyph';
import { useLanguage } from '../../context/LanguageContext';

export default function AppPreview({ app, onClose }) {
  const { t } = useLanguage();
  if (!app) return null;
  return createPortal(<Modal open title={app.label} description={app.notes.summary} onClose={onClose}>
    <div className="ux-modal-body app-details"><AppGlyph name={app.glyph} tone={app.tone}/>
      <ul className="app-preview-features">{app.notes.features.map(feature => <li key={feature}><Icon name="active" size={15}/><span>{feature}</span></li>)}</ul>
    </div>
    <footer className="ux-modal-footer"><button type="button" className="ux-button ux-button-secondary" onClick={onClose}>{t('common.experience.close')}</button><Link className="ux-button ux-button-primary" to={app.href}>{t('common.launcher.openApp',{app:app.label})}<Icon name="arrowRight" size={16}/></Link></footer>
  </Modal>, document.body);
}
