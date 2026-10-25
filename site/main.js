// SlashCode, the site: a few XP behaviours on top of a page that works without them.
document.documentElement.classList.add('js')

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

/* ---------- clock in the tray ---------- */
const clock = $('[data-clock]')
function tick() {
  const now = new Date()
  clock.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  clock.dateTime = now.toISOString()
}
tick()
setInterval(tick, 15000)

/* ---------- start menu ---------- */
const startBtn = $('.start')
const startMenu = $('#start-menu')
function setStart(open) {
  startMenu.hidden = !open
  startBtn.setAttribute('aria-expanded', String(open))
  if (open) $('.sitem', startMenu).focus()
}
startBtn.addEventListener('click', () => setStart(startMenu.hidden))
startMenu.addEventListener('click', (e) => {
  if (e.target.closest('a, [data-close-start]')) setStart(false)
})
document.addEventListener('click', (e) => {
  if (!startMenu.hidden && !e.target.closest('#start-menu, .start')) setStart(false)
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !startMenu.hidden) {
    setStart(false)
    startBtn.focus()
  }
})

/* ---------- window controls: minimise, maximise, close ---------- */
const taskFor = (name) => $(`.task-btn[data-task="${name}"]`)
for (const holder of $$('[data-controls]')) {
  const win = holder.closest('.win')
  const title = $('.title-text', win).textContent
  holder.innerHTML = `
    <button type="button" class="wbtn min" aria-label="Réduire ${title}"></button>
    <button type="button" class="wbtn max" aria-label="Agrandir ${title}" aria-pressed="false"></button>
    <button type="button" class="wbtn close" aria-label="Fermer ${title}"></button>`
  const setMin = (min) => {
    win.classList.toggle('is-min', min)
    taskFor(win.dataset.win)?.classList.toggle('minimised', min)
  }
  $('.min', holder).addEventListener('click', () => setMin(!win.classList.contains('is-min')))
  $('.close', holder).addEventListener('click', () => setMin(true))
  $('.max', holder).addEventListener('click', (e) => {
    const max = win.classList.toggle('is-max')
    e.currentTarget.setAttribute('aria-pressed', String(max))
    setMin(false)
  })
  win.restore = () => setMin(false)
  // Double-clicking a title bar maximises, as it always did.
  $('.title-bar', win).addEventListener('dblclick', (e) => {
    if (!e.target.closest('button')) $('.max', holder).click()
  })
}

// A taskbar button brings back every window of its section.
for (const btn of $$('.task-btn[data-task]')) {
  btn.addEventListener('click', () => {
    const section = document.getElementById(btn.dataset.task)
    $$('.win', section).forEach((w) => w.restore?.())
  })
}

/* ---------- active taskbar button follows the scroll ---------- */
const sections = $$('.task-btn[data-task]').map((b) => document.getElementById(b.dataset.task))
const seen = new Map()
const spy = new IntersectionObserver(
  (entries) => {
    for (const en of entries) seen.set(en.target.id, en.intersectionRatio)
    let best = null
    let bestRatio = 0
    for (const s of sections) {
      const r = seen.get(s.id) ?? 0
      if (r > bestRatio) {
        best = s.id
        bestRatio = r
      }
    }
    if (!best) return
    $$('.task-btn[data-task]').forEach((b) => b.classList.toggle('active', b.dataset.task === best))
  },
  { threshold: [0, 0.15, 0.3, 0.5, 0.7, 1], rootMargin: '-10% 0px -30% 0px' }
)
sections.forEach((s) => spy.observe(s))

/* ---------- guided tour (explorer) ---------- */
const tabs = $$('[role="tab"]')
const address = $('[data-address]')
const status = $('[data-status]')
const prevTour = $('[data-tour="prev"]')
const nextTour = $('[data-tour="next"]')
let tour = 0
function showChapter(i, focus = false) {
  tour = (i + tabs.length) % tabs.length
  tabs.forEach((t, n) => {
    const on = n === tour
    t.setAttribute('aria-selected', String(on))
    t.tabIndex = on ? 0 : -1
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on
  })
  const panel = document.getElementById(tabs[tour].getAttribute('aria-controls'))
  address.textContent = `Poste de travail\\Visite guidée\\${panel.dataset.path}`
  status.textContent = `Chapitre ${tour + 1} sur ${tabs.length}`
  prevTour.disabled = tour === 0
  nextTour.disabled = tour === tabs.length - 1
  if (focus) tabs[tour].focus()
}
tabs.forEach((t, n) => {
  t.addEventListener('click', () => showChapter(n))
  t.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]
    if (step) {
      e.preventDefault()
      showChapter(tour + step, true)
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      showChapter(e.key === 'Home' ? 0 : tabs.length - 1, true)
    }
  })
})
prevTour.addEventListener('click', () => showChapter(tour - 1))
nextTour.addEventListener('click', () => showChapter(tour + 1))
showChapter(0)

/* ---------- install wizard ---------- */
const pages = $$('[data-page]')
const stepBtns = $$('[data-step]')
const wizPrev = $('[data-wiz="prev"]')
const wizNext = $('[data-wiz="next"]')
let step = 0
function showStep(i) {
  step = Math.max(0, Math.min(pages.length - 1, i))
  pages.forEach((p, n) => (p.hidden = n !== step))
  stepBtns.forEach((b, n) => {
    if (n === step) b.setAttribute('aria-current', 'step')
    else b.removeAttribute('aria-current')
    b.classList.toggle('done', n < step)
  })
  wizPrev.disabled = step === 0
  wizNext.textContent = step === pages.length - 1 ? 'Terminer' : 'Suivant >'
}
stepBtns.forEach((b, n) => b.addEventListener('click', () => showStep(n)))
wizPrev.addEventListener('click', () => showStep(step - 1))
wizNext.addEventListener('click', () => {
  if (step === pages.length - 1) {
    document.getElementById('cafe').scrollIntoView()
    return
  }
  showStep(step + 1)
})
showStep(0)

/* ---------- copy buttons ---------- */
async function copy(text, btn) {
  try {
    await navigator.clipboard.writeText(text)
    btn.textContent = 'Copié'
  } catch {
    btn.textContent = 'Sélectionne et copie'
  }
  setTimeout(() => (btn.textContent = 'Copier'), 1800)
}
$$('[data-copy]').forEach((b) => b.addEventListener('click', () => copy($('code', b.parentElement).textContent, b)))
$$('[data-copy-pre]').forEach((b) =>
  b.addEventListener('click', () => {
    const lines = $('pre', b.parentElement).textContent.split('\n')
    copy(lines.filter((l) => !l.startsWith('#')).join('\n'), b)
  })
)

/* ---------- notification demo: the balloon and the flashing button ---------- */
const balloon = $('.balloon')
const demoTask = $('[data-demo-task]')
const demos = [
  {
    icon: '#i-check',
    title: 'site-vitrine : Claude a terminé',
    body: "J'ai corrigé le menu mobile et ajouté le formulaire de contact. Opus, 2 min 14 s."
  },
  {
    icon: '#i-warning',
    title: 'site-vitrine : autorisation demandée',
    body: 'Bash : npm run build'
  }
]
let demoIndex = 0
let balloonTimer
function hideBalloon() {
  balloon.hidden = true
  demoTask.hidden = true
}
$('[data-notify]').addEventListener('click', () => {
  const d = demos[demoIndex++ % demos.length]
  $('[data-balloon-icon]').setAttribute('href', d.icon)
  $('[data-balloon-title]').textContent = d.title
  $('[data-balloon-body]').textContent = d.body
  balloon.hidden = false
  demoTask.hidden = false
  clearTimeout(balloonTimer)
  balloonTimer = setTimeout(hideBalloon, 9000)
})
$('[data-balloon-close]').addEventListener('click', hideBalloon)
