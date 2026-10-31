import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Activity, ArrowDownUp, Bell, Boxes, Check, ChevronDown, CircleHelp, LayoutDashboard, LogOut, Menu, Package, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, UserRound, X } from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Item, ItemInput } from './types'

const starterItems: Item[] = [
  { id: 'demo-1', name: 'Café en grains', category: 'Boisson', quantity: 18, unit: 'paquets', min_quantity: 8, location: 'Réserve A', updated_at: new Date().toISOString() },
  { id: 'demo-2', name: 'Gobelets carton 25 cl', category: 'Consommable', quantity: 6, unit: 'cartons', min_quantity: 10, location: 'Réserve B', updated_at: new Date().toISOString() },
  { id: 'demo-3', name: 'Lait d’avoine', category: 'Boisson', quantity: 24, unit: 'briques', min_quantity: 12, location: 'Frigo 1', updated_at: new Date().toISOString() },
  { id: 'demo-4', name: 'Sirop vanille', category: 'Boisson', quantity: 4, unit: 'bouteilles', min_quantity: 6, location: 'Réserve A', updated_at: new Date().toISOString() },
  { id: 'demo-5', name: 'Filtres papier V60', category: 'Consommable', quantity: 32, unit: 'paquets', min_quantity: 10, location: 'Réserve C', updated_at: new Date().toISOString() },
  { id: 'demo-6', name: 'Chocolat noir 70 %', category: 'Friandise', quantity: 9, unit: 'tablettes', min_quantity: 8, location: 'Réserve A', updated_at: new Date().toISOString() },
]

const inventoryCategories = ['Boisson', 'Alcool', 'Nourritures', 'Friandise', 'Consommable']
const blankItem: ItemInput = { name: '', category: 'Nourritures', quantity: 0, unit: 'unités', min_quantity: 0, location: '' }
type Page = 'overview' | 'inventory' | 'alerts' | 'settings' | 'help' | 'admin'
type AdminRole = 'member' | 'admin' | 'super_admin'
type AdminUser = { id: string; email: string; first_name: string; last_name: string; role: AdminRole; created_at: string; last_sign_in_at: string | null }

function App() {
  const [items, setItems] = useState<Item[]>(starterItems)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userFirstName, setUserFirstName] = useState('')
  const [userLastName, setUserLastName] = useState('')
  const [userRole, setUserRole] = useState<AdminRole | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authFirstName, setAuthFirstName] = useState('')
  const [authLastName, setAuthLastName] = useState('')
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
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountFirstName, setAccountFirstName] = useState('')
  const [accountLastName, setAccountLastName] = useState('')
  const [newAccountEmail, setNewAccountEmail] = useState('')
  const [newAccountPassword, setNewAccountPassword] = useState('')
  const [accountMessage, setAccountMessage] = useState('')
  const [accountBusy, setAccountBusy] = useState(false)
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [adminNotice, setAdminNotice] = useState('')
  const [adminRefresh, setAdminRefresh] = useState(0)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFirstName, setInviteFirstName] = useState('')
  const [inviteLastName, setInviteLastName] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [savingAdminUserId, setSavingAdminUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return }
    void supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? null)
      setUserId(data.session?.user.id ?? null)
      setUserFirstName(String(data.session?.user.user_metadata?.first_name ?? ''))
      setUserLastName(String(data.session?.user.user_metadata?.last_name ?? ''))
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null)
      setUserId(session?.user.id ?? null)
      setUserFirstName(String(session?.user.user_metadata?.first_name ?? ''))
      setUserLastName(String(session?.user.user_metadata?.last_name ?? ''))
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !userId) {
      setUserRole(null)
      return
    }
    let alive = true
    void supabase.from('profiles').select('first_name, last_name, role').eq('id', userId).maybeSingle().then(({ data }) => {
      if (!alive) return
      setUserRole(data?.role === 'super_admin' ? 'super_admin' : data?.role === 'admin' ? 'admin' : 'member')
      if (data?.first_name) setUserFirstName(data.first_name)
      if (data?.last_name) setUserLastName(data.last_name)
    })
    return () => { alive = false }
  }, [userId])

  useEffect(() => {
    if (activePage !== 'admin' || (userRole !== 'admin' && userRole !== 'super_admin') || !supabase) return
    let alive = true
    const loadUsers = async () => {
      setAdminLoading(true)
      setAdminError('')
      const { data: { session } } = await supabase!.auth.getSession()
      if (!session?.access_token) {
        if (alive) { setAdminError('Votre session a expiré. Reconnectez-vous.'); setAdminLoading(false) }
        return
      }
      const response = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${session.access_token}` } })
      const result = await response.json()
      if (!alive) return
      if (!response.ok) setAdminError(result.error ?? 'Impossible de charger les comptes.')
      else setAdminUsers(result.users as AdminUser[])
      setAdminLoading(false)
    }
    void loadUsers()
    return () => { alive = false }
  }, [activePage, userRole, adminRefresh])

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

  const categories = useMemo(() => ['Toutes les catégories', ...inventoryCategories], [])
  const filteredItems = useMemo(() => items.filter(item => {
    const matchesSearch = `${item.name} ${item.category} ${item.location}`.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr'))
    return matchesSearch && (category === 'Toutes les catégories' || item.category === category) && (!showLowOnly || item.quantity <= item.min_quantity)
  }), [items, search, category, showLowOnly])
  const lowItems = items.filter(item => item.quantity <= item.min_quantity)
  const totalUnits = items.reduce((sum, item) => sum + Number(item.quantity), 0)
  const canManageInventory = !isSupabaseConfigured || userRole === 'admin' || userRole === 'super_admin'

  async function signIn(event: FormEvent) {
    event.preventDefault(); setAuthMessage(''); setAuthBusy(true)
    const result = authMode === 'signup'
      ? await supabase!.auth.signUp({ email: authEmail, password: authPassword, options: { data: { first_name: authFirstName.trim(), last_name: authLastName.trim() } } })
      : await supabase!.auth.signInWithPassword({ email: authEmail, password: authPassword })
    setAuthBusy(false)
    if (result.error) setAuthMessage(result.error.message)
    else if (authMode === 'signup' && !result.data.session) setAuthMessage('Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous.')
    else setAuthMessage('Connexion réussie.')
  }

  async function signOut() { await supabase?.auth.signOut(); setUserEmail(null); setUserId(null); setUserRole(null); setUserFirstName(''); setUserLastName('') }
  function openAccount() {
    if (supabase && !userEmail) {
      setAuthMessage('Connectez-vous pour gérer votre compte.')
      return
    }
    setAccountFirstName(userFirstName)
    setAccountLastName(userLastName)
    setNewAccountEmail('')
    setNewAccountPassword('')
    setAccountMessage('')
    setAccountOpen(true)
  }
  async function updateAccount(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !userEmail) return
    const attributes: { email?: string; password?: string; data?: Record<string, string> } = {}
    const email = newAccountEmail.trim()
    const firstName = accountFirstName.trim()
    const lastName = accountLastName.trim()
    const profileChanged = firstName !== userFirstName || lastName !== userLastName
    if (email && email !== userEmail) attributes.email = email
    if (newAccountPassword) attributes.password = newAccountPassword
    if (profileChanged) attributes.data = { first_name: firstName, last_name: lastName }
    if (!attributes.email && !attributes.password && !attributes.data) {
      setAccountMessage('Modifiez au moins un champ avant d’enregistrer.')
      return
    }
    setAccountBusy(true)
    setAccountMessage('')
    const { data, error } = await supabase.auth.updateUser(attributes)
    setAccountBusy(false)
    if (error) {
      setAccountMessage(error.message)
      return
    }
    if (data.user.email) setUserEmail(data.user.email)
    if (attributes.data) {
      setUserFirstName(firstName)
      setUserLastName(lastName)
    }
    setNewAccountEmail('')
    setNewAccountPassword('')
    if (attributes.email) setAccountMessage('Demande envoyée. Confirmez le changement depuis le message reçu par email.')
    else if (attributes.password && attributes.data) setAccountMessage('Votre prénom, votre nom et votre mot de passe ont été mis à jour.')
    else if (attributes.data) setAccountMessage('Votre prénom et votre nom ont été mis à jour.')
    else setAccountMessage('Votre mot de passe a été mis à jour.')
  }
  async function adminRequest(method: 'POST' | 'PATCH', body: Record<string, string>) {
    if (!supabase) throw new Error('Supabase n’est pas configuré.')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Votre session a expiré. Reconnectez-vous.')
    const response = await fetch('/api/admin/users', {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? 'La demande a échoué.')
    return result
  }
  async function inviteAdminMember(event: FormEvent) {
    event.preventDefault(); setInviteBusy(true); setAdminError(''); setAdminNotice('')
    try {
      await adminRequest('POST', { email: inviteEmail, first_name: inviteFirstName, last_name: inviteLastName })
      setInviteEmail(''); setInviteFirstName(''); setInviteLastName('')
      setAdminNotice('Invitation envoyée par email.')
      setAdminRefresh(value => value + 1)
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Impossible d’envoyer l’invitation.')
    } finally { setInviteBusy(false) }
  }
  async function saveAdminMember(event: FormEvent, member: AdminUser) {
    event.preventDefault(); setSavingAdminUserId(member.id); setAdminError(''); setAdminNotice('')
    try {
      await adminRequest('PATCH', { id: member.id, first_name: member.first_name, last_name: member.last_name, role: member.role })
      setAdminNotice('Compte mis à jour.')
      setAdminRefresh(value => value + 1)
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Impossible de mettre à jour ce compte.')
    } finally { setSavingAdminUserId(null) }
  }
  function editAdminMember(id: string, field: 'first_name' | 'last_name' | 'role', value: string) {
    setAdminUsers(current => current.map(user => user.id === id ? { ...user, [field]: value } as AdminUser : user))
  }
  function navigate(page: Page) {
    setActivePage(page)
    setMobileMenuOpen(false)
    setShowLowOnly(page === 'alerts')
    setSearch('')
    setCategory('Toutes les catégories')
  }
  function openNew() {
    if (!canManageInventory) { setNotice('Seuls les administrateurs peuvent modifier l’inventaire.'); return }
    setEditing(null); setForm(blankItem); setSaveError(''); setModalOpen(true)
  }
  function openEdit(item: Item) { setEditing(item); setForm({ name: item.name, category: item.category, quantity: item.quantity, unit: item.unit, min_quantity: item.min_quantity, location: item.location }); setSaveError(''); setModalOpen(true) }

  async function saveItem(event: FormEvent) {
    event.preventDefault()
    if (!canManageInventory) { setSaveError('Seuls les administrateurs peuvent modifier l’inventaire.'); return }
    setSaveError(''); setSaving(true)
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
    if (!canManageInventory) { setNotice('Seuls les administrateurs peuvent modifier l’inventaire.'); return }
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
    admin: 'Administration',
  }
  const userDisplayName = [userFirstName, userLastName].filter(Boolean).join(' ') || userEmail || 'Camille Laurent'

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
          {(userRole === 'admin' || userRole === 'super_admin') && <button className={`nav-link ${activePage === 'admin' ? 'active' : ''}`} onClick={() => navigate('admin')} aria-current={activePage === 'admin' ? 'page' : undefined}><ShieldCheck size={18} /> Administration</button>}
        </nav>
        <div className="sidebar-bottom"><div className="tip-card"><div className="tip-icon"><ShieldCheck size={16} /></div><strong>Tout le monde à jour</strong><p>Les changements sont partagés instantanément avec votre équipe.</p></div><button className={`nav-link subtle ${activePage === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')} aria-current={activePage === 'settings' ? 'page' : undefined}><Settings2 size={18} /> Paramètres</button><button className={`nav-link subtle ${activePage === 'help' ? 'active' : ''}`} onClick={() => navigate('help')} aria-current={activePage === 'help' ? 'page' : undefined}><CircleHelp size={18} /> Aide & support</button></div>
        <div className="profile-row"><div className="profile-avatar">{userFirstName ? userFirstName[0].toUpperCase() : userEmail ? userEmail[0].toUpperCase() : 'CL'}</div><div className="profile-info"><strong>{userDisplayName}</strong><span>{userEmail ? 'Membre' : 'Administratrice'}</span></div>{userEmail && <button className="icon-button" onClick={signOut} aria-label="Se déconnecter" title="Se déconnecter"><LogOut size={17} /></button>}</div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumbs"><span>HDE-Inventaire</span><span className="crumb-slash">/</span><strong>{pageLabels[activePage]}</strong></div><div className="top-actions"><span className="sync-status"><span className="status-dot" /> {supabase && userEmail ? 'Synchronisé' : 'Aperçu'}</span><button className="account-button" onClick={openAccount}><UserRound size={17} /><span>Mon compte</span></button><button className="mobile-menu" aria-label="Ouvrir le menu" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(open => !open)}><Menu size={20} /></button></div></header>
        <div className="content-wrap">
          {!isSupabaseConfigured && <div className="setup-banner"><div><strong>Mode aperçu</strong><span>Ajoutez vos identifiants Supabase pour partager les données en ligne.</span></div><a href="./README.md">Voir les étapes <span>↗</span></a></div>}
          {notice && <div className="notice"><Check size={16} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Fermer"><X size={15} /></button></div>}
          {userEmail && userRole === 'member' && <div className="setup-banner"><div><strong>Accès membre</strong><span>Vous pouvez consulter l’inventaire. Les modifications sont réservées aux administrateurs.</span></div></div>}
          {activePage === 'overview' && <>
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> VOTRE ESPACE DE TRAVAIL</div><h1>Bonjour {userFirstName || (userEmail ? 'membre' : 'Camille')} <span className="wave">✦</span></h1><p>Voici ce qui se passe dans votre inventaire aujourd’hui.</p></div>{canManageInventory && <button className="button button-primary" onClick={openNew}><Plus size={17} /> Ajouter un article</button>}</section>
          <section className="stats-grid" aria-label="Résumé de l’inventaire">
            <article className="stat-card"><div className="stat-top"><span>Articles suivis</span><span className="stat-icon violet"><Package size={17} /></span></div><div className="stat-value">{items.length}<span className="stat-unit"> références</span></div><div className="stat-note"><span className="note-pill positive">+2</span><span>depuis la semaine dernière</span></div></article>
            <article className="stat-card"><div className="stat-top"><span>Unités en stock</span><span className="stat-icon green"><Boxes size={17} /></span></div><div className="stat-value">{totalUnits}<span className="stat-unit"> unités</span></div><div className="stat-note"><span className="note-muted">Toutes catégories confondues</span></div></article>
            <article className="stat-card"><div className="stat-top"><span>À réapprovisionner</span><span className="stat-icon amber"><Bell size={17} /></span></div><div className="stat-value">{lowItems.length}<span className="stat-unit"> articles</span></div><div className="stat-note"><button className="text-link" onClick={() => navigate('alerts')}>Voir les alertes <span>→</span></button></div></article>
            <article className="stat-card activity-card"><div className="stat-top"><span>Activité récente</span><span className="stat-icon blue"><Activity size={17} /></span></div><div className="stat-value activity-value"><span className="activity-face">CL</span> Camille a modifié le stock</div><div className="stat-note"><span className="note-muted">Il y a 12 minutes</span></div></article>
          </section>
          </>}

          {(activePage === 'overview' || activePage === 'inventory' || activePage === 'alerts') && <>
          {activePage !== 'overview' && <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> HDE-INVENTAIRE</div><h1>{pageLabels[activePage]}</h1><p>{activePage === 'alerts' ? 'Articles dont la quantité a atteint le seuil de réapprovisionnement.' : 'Recherchez et gérez les articles de votre espace.'}</p></div>{activePage !== 'alerts' && canManageInventory && <button className="button button-primary" onClick={openNew}><Plus size={17} /> Ajouter un article</button>}</section>}
          <section className="inventory-panel" id="inventaire">
            <div className="panel-heading"><div><h2>Inventaire</h2><p>Retrouvez et gérez tous les articles de votre espace.</p></div><button className="button button-outline" onClick={() => setNotice('Export CSV : cette fonction sera ajoutée dans une prochaine étape.')}><ArrowDownUp size={16} /> Exporter</button></div>
            <div className="toolbar"><label className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un article..." /></label><div className="toolbar-controls"><label className="select-wrap"><SlidersHorizontal size={15} /><select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={14} /></label><button className={`filter-button ${showLowOnly ? 'selected' : ''}`} onClick={() => setShowLowOnly(!showLowOnly)}><Bell size={15} /> En alerte {lowItems.length > 0 && <span>{lowItems.length}</span>}</button></div></div>
            <div className="table-wrap"><table><thead><tr><th>ARTICLE</th><th>CATÉGORIE</th><th>QUANTITÉ</th><th>EMPLACEMENT</th><th>MISE À JOUR</th><th></th></tr></thead><tbody>
              {filteredItems.map(item => <tr key={item.id}><td><div className="item-cell"><span className={`item-icon item-${item.category.toLowerCase().replace(/[^a-z]/g, '')}`}><Package size={17} /></span><strong>{item.name}</strong></div></td><td><span className="category-tag">{item.category}</span></td><td><div className="quantity-cell"><strong className={item.quantity <= item.min_quantity ? 'quantity-low' : ''}>{item.quantity}</strong><span>{item.unit}</span>{item.quantity <= item.min_quantity && <span className="low-badge">Bas</span>}</div></td><td><span className="location-cell"><span className="location-dot" />{item.location || '—'}</span></td><td><span className="date-cell">{userEmail ? 'À l’instant' : 'Aujourd’hui'}</span></td><td>{canManageInventory && <div className="row-actions"><button onClick={() => openEdit(item)} aria-label={`Modifier ${item.name}`} title="Modifier"><Settings2 size={16} /></button><button onClick={() => void deleteItem(item)} aria-label={`Supprimer ${item.name}`} title="Supprimer"><X size={16} /></button></div>}</td></tr>)}
              {filteredItems.length === 0 && <tr><td colSpan={6} className="empty-state">{activePage === 'alerts' ? 'Aucun article à réapprovisionner pour le moment.' : 'Aucun article ne correspond à votre recherche.'}</td></tr>}
            </tbody></table></div>
            <div className="table-footer"><span>Affichage de <strong>{filteredItems.length}</strong> sur <strong>{items.length}</strong> articles</span>{canManageInventory && <button className="button button-small" onClick={openNew}><Plus size={15} /> Nouvel article</button>}</div>
          </section>
          </>}
          {activePage === 'settings' && <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> HDE-INVENTAIRE</div><h1>Paramètres</h1><p>Informations sur votre espace et votre connexion.</p></div></section>}
          {activePage === 'settings' && <section className="info-grid"><article className="info-card"><span className="info-label">ESPACE DE TRAVAIL</span><h2>Atelier du coin</h2><p>Inventaire partagé entre les membres de cet espace.</p></article><article className="info-card"><span className="info-label">COMPTE</span><h2>{userEmail ?? 'Mode aperçu'}</h2><p>{userEmail ? 'Vous êtes connecté à cet espace.' : 'Connectez-vous pour synchroniser les changements avec Supabase.'}</p>{userEmail && <button className="button button-outline" onClick={signOut}><LogOut size={16} /> Se déconnecter</button>}</article><article className="info-card"><span className="info-label">SYNCHRONISATION</span><h2>{supabase && userEmail ? 'Active' : 'Mode aperçu'}</h2><p>{supabase && userEmail ? 'Les changements d’inventaire sont enregistrés dans Supabase.' : 'Les changements ne sont pas encore partagés en ligne.'}</p></article></section>}
          {activePage === 'help' && <><section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> HDE-INVENTAIRE</div><h1>Aide & support</h1><p>Quelques repères pour gérer votre inventaire.</p></div></section><section className="info-grid help-grid"><article className="info-card"><span className="info-label">AJOUTER UN ARTICLE</span><h2>Suivre un nouveau produit</h2><p>Ouvrez <strong>Inventaire</strong>, puis cliquez sur <strong>Ajouter un article</strong>. Renseignez son nom, sa quantité, son unité et son seuil d’alerte.</p></article><article className="info-card"><span className="info-label">ALERTES</span><h2>Repérer les stocks bas</h2><p>La page <strong>Alertes</strong> affiche les articles dont la quantité est inférieure ou égale au seuil défini.</p></article><article className="info-card"><span className="info-label">PARTAGE</span><h2>Voir les mêmes données</h2><p>Connectez-vous avec un compte autorisé pour consulter et modifier le même inventaire partagé.</p></article></section></>}
          {activePage === 'admin' && (userRole === 'admin' || userRole === 'super_admin') && <>
            <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {userRole === 'super_admin' ? 'ESPACE SUPER ADMIN' : 'ESPACE ADMINISTRATEUR'}</div><h1>{userRole === 'super_admin' ? 'Gestion complète' : 'Gestion du stock'}</h1><p>{userRole === 'super_admin' ? 'Invitez des membres et attribuez les rôles administrateur ou membre.' : 'Invitez des membres et gérez les articles de l’inventaire.'}</p></div></section>
            {adminNotice && <div className="notice"><Check size={16} /><span>{adminNotice}</span><button onClick={() => setAdminNotice('')} aria-label="Fermer"><X size={15} /></button></div>}
            {adminError && <div className="auth-message admin-error">{adminError}</div>}
            <section className="admin-panel"><div className="panel-heading"><div><h2>Inviter un membre</h2><p>Un lien de création de compte sera envoyé à son adresse email.</p></div></div><form className="admin-invite-form" onSubmit={inviteAdminMember}><label className="field">Prénom<input required value={inviteFirstName} onChange={event => setInviteFirstName(event.target.value)} /></label><label className="field">Nom de famille<input required value={inviteLastName} onChange={event => setInviteLastName(event.target.value)} /></label><label className="field">Email<input required type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} /></label><button className="button button-primary" disabled={inviteBusy}><Plus size={16} /> {inviteBusy ? 'Envoi…' : 'Envoyer une invitation'}</button></form></section>
            <section className="admin-panel"><div className="panel-heading"><div><h2>Membres</h2><p>{adminUsers.length} compte{adminUsers.length === 1 ? '' : 's'} dans l’espace.{userRole === 'admin' ? ' Les rôles sont gérés par le super admin.' : ''}</p></div></div>{adminLoading ? <p className="admin-empty">Chargement des comptes…</p> : adminUsers.length === 0 ? <p className="admin-empty">Aucun compte à afficher.</p> : <div className="admin-member-list">{adminUsers.map(member => userRole === 'super_admin' && member.role !== 'super_admin' ? <form className="admin-member-row" key={member.id} onSubmit={event => void saveAdminMember(event, member)}><div className="admin-member-email"><strong>{member.email}</strong><span>{member.id === userId ? 'Votre compte' : `Inscrit le ${new Date(member.created_at).toLocaleDateString('fr-FR')}`}</span></div><label className="field">Prénom<input required value={member.first_name} onChange={event => editAdminMember(member.id, 'first_name', event.target.value)} /></label><label className="field">Nom<input required value={member.last_name} onChange={event => editAdminMember(member.id, 'last_name', event.target.value)} /></label><label className="field">Rôle<select value={member.role} onChange={event => editAdminMember(member.id, 'role', event.target.value as AdminRole)}><option value="member">Membre</option><option value="admin">Administrateur</option></select></label><button className="button button-outline" disabled={savingAdminUserId === member.id}>{savingAdminUserId === member.id ? 'Enregistrement…' : 'Enregistrer'}</button></form> : <div className="admin-member-row admin-member-readonly" key={member.id}><div className="admin-member-email"><strong>{member.email}</strong><span>{member.id === userId ? 'Votre compte' : `Inscrit le ${new Date(member.created_at).toLocaleDateString('fr-FR')}`}</span></div><div className="admin-member-name"><span>Prénom</span><strong>{member.first_name || '—'}</strong></div><div className="admin-member-name"><span>Nom</span><strong>{member.last_name || '—'}</strong></div><div className="admin-member-role">{member.role === 'super_admin' ? 'Super admin' : member.role === 'admin' ? 'Administrateur' : 'Membre'}</div></div>)}</div>}</section>
          </>}
          <footer className="page-footer"><span><span className="footer-dot" /> Tout est à jour</span><span>Dernière synchronisation il y a quelques secondes</span></footer>
        </div>
      </main>
      {mobileMenuOpen && <button className="mobile-nav-backdrop" aria-label="Fermer le menu" onClick={() => setMobileMenuOpen(false)} />}

      {accountOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setAccountOpen(false) }}><section className="item-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title"><div className="modal-head"><div><span className="modal-kicker">HDE-INVENTAIRE</span><h2 id="account-title">Gérer mon compte</h2></div><button type="button" className="icon-button" onClick={() => setAccountOpen(false)} aria-label="Fermer"><X size={19} /></button></div>{userEmail && supabase ? <form onSubmit={updateAccount}><p className="account-current">Compte connecté : <strong>{userEmail}</strong></p><label className="field full">Prénom<input required value={accountFirstName} onChange={event => setAccountFirstName(event.target.value)} /></label><label className="field full">Nom de famille<input required value={accountLastName} onChange={event => setAccountLastName(event.target.value)} /></label><label className="field full">Nouvelle adresse email<input type="email" value={newAccountEmail} onChange={event => setNewAccountEmail(event.target.value)} placeholder="Laisser vide pour ne pas modifier" /></label><label className="field full">Nouveau mot de passe<input type="password" minLength={8} value={newAccountPassword} onChange={event => setNewAccountPassword(event.target.value)} placeholder="8 caractères minimum" /></label>{accountMessage && <div className="auth-message">{accountMessage}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={async () => { await signOut(); setAccountOpen(false) }}><LogOut size={16} /> Se déconnecter</button><button className="button button-primary" disabled={accountBusy}>{accountBusy ? 'Enregistrement…' : 'Enregistrer'}</button></div></form> : <><p>La gestion du compte est disponible après connexion à Supabase. En mode aperçu, les données restent temporaires.</p><div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setAccountOpen(false)}>Fermer</button></div></>}</section></div>}

      {isSupabaseConfigured && !userEmail && <div className="auth-overlay"><form className="auth-card" onSubmit={signIn}><div className="brand-mark auth-mark"><Boxes size={21} /></div><h2>{authMode === 'signin' ? 'Connectez-vous' : 'Créer votre accès'}</h2><p>Connectez-vous pour voir l’inventaire partagé de votre équipe.</p>{authMode === 'signup' && <><label>Prénom<input type="text" required value={authFirstName} onChange={event => setAuthFirstName(event.target.value)} placeholder="Votre prénom" /></label><label>Nom de famille<input type="text" required value={authLastName} onChange={event => setAuthLastName(event.target.value)} placeholder="Votre nom" /></label></>}<label>Email<input type="email" required value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="vous@exemple.fr" /></label><label>Mot de passe<input type="password" minLength={8} required value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="8 caractères minimum" /></label>{authMessage && <div className="auth-message">{authMessage}</div>}<button className="button button-primary auth-submit" disabled={authBusy}>{authBusy ? 'Patientez…' : authMode === 'signin' ? 'Se connecter' : 'Créer un compte'}</button><button type="button" className="auth-toggle" onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthMessage('') }}>{authMode === 'signin' ? 'Pas encore de compte ? Créer un accès' : 'Déjà inscrit·e ? Se connecter'}</button></form></div>}

          {modalOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModalOpen(false) }}><form className="item-modal" onSubmit={saveItem}><div className="modal-head"><div><span className="modal-kicker">INVENTAIRE</span><h2>{editing ? 'Modifier un article' : 'Ajouter un article'}</h2></div><button type="button" className="icon-button" onClick={() => setModalOpen(false)} aria-label="Fermer"><X size={19} /></button></div><label className="field full">Nom de l’article<input autoFocus required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex. Café en grains" /></label><div className="form-grid"><label className="field">Catégorie<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{inventoryCategories.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="field">Emplacement<input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Ex. Réserve A" /></label><label className="field">Quantité actuelle<input type="number" min="0" required value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></label><label className="field">Unité<input required value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="unités, cartons…" /></label><label className="field full">Seuil d’alerte<input type="number" min="0" required value={form.min_quantity} onChange={e => setForm({ ...form, min_quantity: Number(e.target.value) })} /><span className="field-hint">Vous serez alerté lorsque le stock atteint ce niveau.</span></label></div>{saveError && <div className="auth-message">{saveError}</div>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setModalOpen(false)}>Annuler</button><button className="button button-primary" disabled={saving}>{saving ? 'Enregistrement…' : editing ? 'Enregistrer' : <><Plus size={16} /> Ajouter l’article</>}</button></div></form></div>}
    </div>
  )
}

export default App
