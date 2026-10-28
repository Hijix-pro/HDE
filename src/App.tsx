import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Activity, ArrowDownUp, Bell, Boxes, Check, ChevronDown, CircleHelp, LayoutDashboard, LogOut, Menu, Package, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Item, ItemInput } from './types'

const starterItems: Item[] = [
  { id: 'demo-1', name: 'Café en grains', category: 'Épicerie', quantity: 18, unit: 'paquets', min_quantity: 8, location: 'Réserve A', updated_at: new Date().toISOString() },
  { id: 'demo-2', name: 'Gobelets carton 25 cl', category: 'Emballages', quantity: 6, unit: 'cartons', min_quantity: 10, location: 'Réserve B', updated_at: new Date().toISOString() },
  { id: 'demo-3', name: 'Lait d’avoine', category: 'Épicerie', quantity: 24, unit: 'briques', min_quantity: 12, location: 'Frigo 1', updated_at: new Date().toISOString() },
  { id: 'demo-4', name: 'Sirop vanille', category: 'Boissons', quantity: 4, unit: 'bouteilles', min_quantity: 6, location: 'Réserve A', updated_at: new Date().toISOString() },
  { id: 'demo-5', name: 'Filtres papier V60', category: 'Équipement', quantity: 32, unit: 'paquets', min_quantity: 10, location: 'Réserve C', updated_at: new Date().toISOString() },
  { id: 'demo-6', name: 'Chocolat noir 70 %', category: 'Épicerie', quantity: 9, unit: 'tablettes', min_quantity: 8, location: 'Réserve A', updated_at: new Date().toISOString() },
]

const blankItem: ItemInput = { name: '', category: 'Épicerie', quantity: 0, unit: 'unités', min_quantity: 0, location: '' }
type Page = 'overview' | 'inventory' | 'alerts' | 'settings' | 'help'

function App() {
  const [items, setItems] = useState<Item[]>(starterItems)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Toutes les catégories')
  const [showLowOnly, setShowLowOnly] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [form, setForm] = useState<ItemInput>(blankItem)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [activePage, setActivePage] = useState<Page>('overview')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return }
    void supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? null)
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !userEmail) return
    let alive = true
    const load = async () => {
      const { data, error } = await supabase!.from('inventory_items').select('*').order('name')
      if (!alive) return
      if (error) setNotice(`Chargement impossible : ${error.message}`)
      else setItems((data ?? []) as Item[])
    }
    void load()
    const channel = supabase.channel('inventory-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => { void load() }).subscribe()
    return () => { alive = false; void supabase!.removeChannel(channel) }
  }, [userEmail])

  const categories = useMemo(() => ['Toutes les catégories', ...new Set(items.map(item => item.category).filter(Boolean))], [items])
  const filteredItems = useMemo(() => items.filter(item => {
    const matchesSearch = `${item.name} ${item.category} ${item.location}`.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr'))
    return matchesSearch && (category === 'Toutes les catégories' || item.category === category) && (!showLowOnly || item.quantity <= item.min_quantity)
  }), [items, search, category, showLowOnly])
  const lowItems = items.filter(item => item.quantity <= item.min_quantity)
  const totalUnits = items.reduce((sum, item) => sum + Number(item.quantity), 0)

  async function signIn(event: FormEvent) {
    event.preventDefault(); setAuthMessage(''); setAuthBusy(true)
    const result = authMode === 'signup'
      ? await supabase!.auth.signUp({ email: authEmail, password: authPassword })
      : await supabase!.auth.signInWithPassword({ email: authEmail, password: authPassword })
    setAuthBusy(false)
    if (result.error) setAuthMessage(result.error.message)
    else if (authMode === 'signup' && !result.data.session) setAuthMessage('Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous.')
    else setAuthMessage('Connexion réussie.')
  }

  async function signOut() { await supabase?.auth.signOut(); setUserEmail(null) }
  function navigate(page: Page) {
    setActivePage(page)
    setMobileMenuOpen(false)
    setShowLowOnly(page === 'alerts')
    setSearch('')
    setCategory('Toutes les catégories')
  }
  function openNew() { setEditing(null); setForm(blankItem); setSaveError(''); setModalOpen(true) }
  function openEdit(item: Item) { setEditing(item); setForm({ name: item.name, category: item.category, quantity: item.quantity, unit: item.unit, min_quantity: item.min_quantity, location: item.location }); setSaveError(''); setModalOpen(true) }

  async function saveItem(event: FormEvent) {
    event.preventDefault(); setSaveError(''); setSaving(true)
    const input = { ...form, name: form.name.trim(), updated_at: new Date().toISOString() }
    if (supabase && userEmail) {
      const result = editing
        ? await supabase.from('inventory_items').update(input).eq('id', editing.id)
        : await supabase.from('inventory_items').insert(input)
      setSaving(false)
      if (result.error) { setSaveError(result.error.message); return }
      setNotice(editing ? 'Article mis à jour.' : 'Article ajouté.')
    } else {
      const item: Item = { ...input, id: editing?.id ?? crypto.randomUUID() }
      setItems(current => editing ? current.map(existing => existing.id === editing.id ? item : existing) : [item, ...current])
      setNotice('Modifications enregistrées dans cette session de démonstration.')
      setSaving(false)
    }
    setModalOpen(false)
  }

  async function deleteItem(item: Item) {
    if (!window.confirm(`Supprimer « ${item.name} » de l’inventaire ?`)) return
    if (supabase && userEmail) {
      const { error } = await supabase.from('inventory_items').delete().eq('id', item.id)
      if (error) { setNotice(`Suppression impossible : ${error.message}`); return }
    } else setItems(current => current.filter(existing => existing.id !== item.id))
    setNotice('Article supprimé.')
  }

  const pageLabels: Record<Page, string> = {
    overview: 'Vue d’ensemble',
    inventory: 'Inventaire',
    alerts: 'Alertes de stock',
    settings: 'Paramètres',
    help: 'Aide & support',
  }

  if (!authReady) return <div className="loading-screen"><div className="brand-mark"><Boxes size={21} /></div><span>Ouverture de votre espace…</span></div>

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <button className="brand" onClick={() => navigate('overview')}><span className="brand-mark"><Boxes size={21} strokeWidth={2.3} /></span><span>HDE-Inventaire</span></button>
        <button className="workspace-switch" onClick={() => navigate('settings')} aria-label="Ouvrir les paramètres de l’espace"><div className="workspace-avatar">A</div><div className="workspace-text"><strong>Atelier du coin</strong><span>Espace partagé</span></div><ChevronDown size={16} /></button>
        <div className="nav-label">ESPACE DE TRAVAIL</div>
        <nav className="nav-list" aria-label="Navigation principale">
          <button className={`nav-link ${activePage === 'overview' ? 'active' : ''}`} onClick={() => navigate('overview')} aria-current={activePage === 'overview' ? 'page' : undefined}><LayoutDashboard size={18} /> Vue d’ensemble</button>
          <button className={`nav-link ${activePage === 'inventory' ? 'active' : ''}`} onClick={() => navigate('inventory')} aria-current={activePage === 'inventory' ? 'page' : undefined}><Package size={18} /> Inventaire <span className="nav-count">{items.length}</span></button>
          <button className={`nav-link ${activePage === 'alerts' ? 'active' : ''}`} onClick={() => navigate('alerts')} aria-current={activePage === 'alerts' ? 'page' : undefined}><Bell size={18} /> Alertes{lowItems.length > 0 && <span className="alert-count">{lowItems.length}</span>}</button>
        </nav>
        <div className="sidebar-bottom"><div className="tip-card"><div className="tip-icon"><ShieldCheck size={16} /></div><strong>Tout le monde à jour</strong><p>Les changements sont partagés instantanément avec votre équipe.</p></div><button className={`nav-link subtle ${activePage === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')} aria-current={activePage === 'settings' ? 'page' : undefined}><Settings2 size={18} /> Paramètres</button><button className={`nav-link subtle ${activePage === 'help' ? 'active' : ''}`} onClick={() => navigate('help')} aria-current={activePage === 'help' ? 'page' : undefined}><CircleHelp size={18} /> Aide & support</button></div>
        <div className="profile-row"><div className="profile-avatar">{userEmail ? userEmail[0].toUpperCase() : 'CL'}</div><div className="profile-info"><strong>{userEmail ?? 'Camille Laurent'}</strong><span>{userEmail ? 'Membre' : 'Administratrice'}</span></div>{userEmail && <button className="icon-button" onClick={signOut} aria-label="Se déconnecter" title="Se déconnecter"><LogOut size={17} /></button>}</div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumbs"><span>HDE-Inventaire</span><span className="crumb-slash">/</span><strong>{pageLabels[activePage]}</strong></div><div className="top-actions"><span className="sync-status"><span className="status-dot" /> {supabase && userEmail ? 'Synchronisé' : 'Aperçu'}</span><button className="avatar-stack" title="Membres de l’espace"><span>CL</span><span>+2</span></button><button className="mobile-menu" aria-label="Ouvrir le menu" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(open => !open)}><Menu size={20} /></button></div></header>
        <div className="content-wrap">
          {!isSupabaseConfigured && <div className="setup-banner"><div><strong>Mode aperçu</strong><span>Ajoutez vos identifiants Supabase pour partager les données en ligne.</span></div><a href="./README.md">Voir les étapes <span>↗</span></a></div>}
          {notice && <div className="notice"><Check size={16} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Fermer"><X size={15} /></button></div>}
          {activePage === 'overview' && <>
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> VOTRE ESPACE DE TRAVAIL</div><h1>Bonjour Camille <span className="wave">✦</span></h1><p>Voici ce qui se passe dans votre inventaire aujourd’hui.</p></div><button className="button button-primary" onClick={openNew}><Plus size={17} /> Ajouter un article</button></section>
          <section className="stats-grid" aria-label="Résumé de l’inventaire">
            <article className="stat-card"><div className="stat-top"><span>Articles suivis</span><span className="stat-icon violet"><Package size={17} /></span></div><div className="stat-value">{items.length}<span className="stat-unit"> références</span></div><div className="stat-note"><span className="note-pill positive">+2</span><span>depuis la semaine dernière</span></div></article>
            <article className="stat-card"><div className="stat-top"><span>Unités en stock</span><span className="stat-icon green"><Boxes size={17} /></span></div><div className="stat-value">{totalUnits}<span className="stat-unit"> unités</span></div><div className="stat-note"><span className="note-muted">Toutes catégories confondues</span></div></article>
            <article className="stat-card"><div className="stat-top"><span>À réapprovisionner</span><span className="stat-icon amber"><Bell size={17} /></span></div><div className="stat-value">{lowItems.length}<span className="stat-unit"> articles</span></div><div className="stat-note"><button className="text-link" onClick={() => navigate('alerts')}>Voir les alertes <span>→</span></button></div></article>
            <article className="stat-card activity-card"><div className="stat-top"><span>Activité récente</span><span className="stat-icon blue"><Activity size={17} /></span></div><div className="stat-value activity-value"><span className="activity-face">CL</span> Camille a modifié le stock</div><div className="stat-note"><span className="note-muted">Il y a 12 minutes</span></div></article>
          </section>
          </>}

          {(activePage === 'overview' || activePage === 'inventory' || activePage === 'alerts') && <>
          {activePage !== 'overview' && <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> HDE-INVENTAIRE</div><h1>{pageLabels[activePage]}</h1><p>{activePage === 'alerts' ? 'Articles dont la quantité a atteint le seuil de réapprovisionnement.' : 'Recherchez et gérez les articles de votre espace.'}</p></div>{activePage !== 'alerts' && <button className="button button-primary" onClick={openNew}><Plus size={17} /> Ajouter un article</button>}</section>}
          <section className="inventory-panel" id="inventaire">
            <div className="panel-heading"><div><h2>Inventaire</h2><p>Retrouvez et gérez tous les articles de votre espace.</p></div><button className="button button-outline" onClick={() => setNotice('Export CSV : cette fonction sera ajoutée dans une prochaine étape.')}><ArrowDownUp size={16} /> Exporter</button></div>
            <div className="toolbar"><label className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un article..." /></label><div className="toolbar-controls"><label className="select-wrap"><SlidersHorizontal size={15} /><select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={14} /></label><button className={`filter-button ${showLowOnly ? 'selected' : ''}`} onClick={() => setShowLowOnly(!showLowOnly)}><Bell size={15} /> En alerte {lowItems.length > 0 && <span>{lowItems.length}</span>}</button></div></div>
            <div className="table-wrap"><table><thead><tr><th>ARTICLE</th><th>CATÉGORIE</th><th>QUANTITÉ</th><th>EMPLACEMENT</th><th>MISE À JOUR</th><th></th></tr></thead><tbody>
              {filteredItems.map(item => <tr key={item.id}><td><div className="item-cell"><span className={`item-icon item-${item.category.toLowerCase().replace(/[^a-z]/g, '')}`}><Package size={17} /></span><strong>{item.name}</strong></div></td><td><span className="category-tag">{item.category}</span></td><td><div className="quantity-cell"><strong className={item.quantity <= item.min_quantity ? 'quantity-low' : ''}>{item.quantity}</strong><span>{item.unit}</span>{item.quantity <= item.min_quantity && <span className="low-badge">Bas</span>}</div></td><td><span className="location-cell"><span className="location-dot" />{item.location || '—'}</span></td><td><span className="date-cell">{userEmail ? 'À l’instant' : 'Aujourd’hui'}</span></td><td><div className="row-actions"><button onClick={() => openEdit(item)} aria-label={`Modifier ${item.name}`} title="Modifier"><Settings2 size={16} /></button><button onClick={() => void deleteItem(item)} aria-label={`Supprimer ${item.name}`} title="Supprimer"><X size={16} /></button></div></td></tr>)}
              {filteredItems.length === 0 && <tr><td colSpan={6} className="empty-state">{activePage === 'alerts' ? 'Aucun article à réapprovisionner pour le moment.' : 'Aucun article ne correspond à votre recherche.'}</td></tr>}
            </tbody></table></div>
            <div className="table-footer"><span>Affichage de <strong>{filteredItems.length}</strong> sur <strong>{items.length}</strong> articles</span><button className="button button-small" onClick={openNew}><Plus size={15} /> Nouvel article</button></div>
          </section>
          </>}
          {activePage === 'settings' && <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> HDE-INVENTAIRE</div><h1>Paramètres</h1><p>Informations sur votre espace et votre connexion.</p></div></section>}
          {activePage === 'settings' && <section className="info-grid"><article className="info-card"><span className="info-label">ESPACE DE TRAVAIL</span><h2>Atelier du coin</h2><p>Inventaire partagé entre les membres de cet espace.</p></article><article className="info-card"><span className="info-label">COMPTE</span><h2>{userEmail ?? 'Mode aperçu'}</h2><p>{userEmail ? 'Vous êtes connecté à cet espace.' : 'Connectez-vous pour synchroniser les changements avec Supabase.'}</p>{userEmail && <button className="button button-outline" onClick={signOut}><LogOut size={16} /> Se déconnecter</button>}</article><article className="info-card"><span className="info-label">SYNCHRONISATION</span><h2>{supabase && userEmail ? 'Active' : 'Mode aperçu'}</h2><p>{supabase && userEmail ? 'Les changements d’inventaire sont enregistrés dans Supabase.' : 'Les changements ne sont pas encore partagés en ligne.'}</p></article></section>}
          {activePage === 'help' && <><section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> HDE-INVENTAIRE</div><h1>Aide & support</h1><p>Quelques repères pour gérer votre inventaire.</p></div></section><section className="info-grid help-grid"><article className="info-card"><span className="info-label">AJOUTER UN ARTICLE</span><h2>Suivre un nouveau produit</h2><p>Ouvrez <strong>Inventaire</strong>, puis cliquez sur <strong>Ajouter un article</strong>. Renseignez son nom, sa quantité, son unité et son seuil d’alerte.</p></article><article className="info-card"><span className="info-label">ALERTES</span><h2>Repérer les stocks bas</h2><p>La page <strong>Alertes</strong> affiche les articles dont la quantité est inférieure ou égale au seuil défini.</p></article><article className="info-card"><span className="info-label">PARTAGE</span><h2>Voir les mêmes données</h2><p>Connectez-vous avec un compte autorisé pour consulter et modifier le même inventaire partagé.</p></article></section></>}
          <footer className="page-footer"><span><span className="footer-dot" /> Tout est à jour</span><span>Dernière synchronisation il y a quelques secondes</span></footer>
        </div>
      </main>
      {mobileMenuOpen && <button className="mobile-nav-backdrop" aria-label="Fermer le menu" onClick={() => setMobileMenuOpen(false)} />}

      {isSupabaseConfigured && !userEmail && <div className="auth-overlay"><form className="auth-card" onSubmit={signIn}><div className="brand-mark auth-mark"><Boxes size={21} /></div><h2>{authMode === 'signin' ? 'Connectez-vous' : 'Créer votre accès'}</h2><p>Connectez-vous pour voir l’inventaire partagé de votre équipe.</p><label>Email<input type="email" required value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="vous@exemple.fr" /></label><label>Mot de passe<input type="password" minLength={8} required value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="8 caractères minimum" /></label>{authMessage && <div className="auth-message">{authMessage}</div>}<button className="button button-primary auth-submit" disabled={authBusy}>{authBusy ? 'Patientez…' : authMode === 'signin' ? 'Se connecter' : 'Créer un compte'}</button><button type="button" className="auth-toggle" onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthMessage('') }}>{authMode === 'signin' ? 'Pas encore de compte ? Créer un accès' : 'Déjà inscrit·e ? Se connecter'}</button></form></div>}

      {modalOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModalOpen(false) }}><form className="item-modal" onSubmit={saveItem}><div className="modal-head"><div><span className="modal-kicker">INVENTAIRE</span><h2>{editing ? 'Modifier un article' : 'Ajouter un article'}</h2></div><button type="button" className="icon-button" onClick={() => setModalOpen(false)} aria-label="Fermer"><X size={19} /></button></div><label className="field full">Nom de l’article<input autoFocus required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex. Café en grains" /></label><div className="form-grid"><label className="field">Catégorie<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}><option>Épicerie</option><option>Boissons</option><option>Emballages</option><option>Équipement</option><option>Autre</option></select></label><label className="field">Emplacement<input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Ex. Réserve A" /></label><label className="field">Quantité actuelle<input type="number" min="0" required value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></label><label className="field">Unité<input required value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="unités, cartons…" /></label><label className="field full">Seuil d’alerte<input type="number" min="0" required value={form.min_quantity} onChange={e => setForm({ ...form, min_quantity: Number(e.target.value) })} /><span className="field-hint">Vous serez alerté lorsque le stock atteint ce niveau.</span></label></div>{saveError && <div className="auth-message">{saveError}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setModalOpen(false)}>Annuler</button><button className="button button-primary" disabled={saving}>{saving ? 'Enregistrement…' : editing ? 'Enregistrer' : <><Plus size={16} /> Ajouter l’article</>}</button></div></form></div>}
    </div>
  )
}

export default App
