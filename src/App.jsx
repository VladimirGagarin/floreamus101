import { useState, useEffect, useCallback, useRef } from 'react'
import bookData from './book.json'
import './App.css'

const THEMES = {
  white: { labelEn: 'Daylight', labelIt: 'Giorno', icon: '☀' },
  dim: { labelEn: 'Lamplight', labelIt: 'Lampada', icon: '◐' },
  rome: { labelEn: 'Candlelight', labelIt: 'Candela', icon: '☾' },
}
const THEME_ORDER = ['white', 'dim', 'rome']

const LANG_KEY = 'af-lang'
const BM_KEY = 'af-bookmarks'
const PAGE_ID_KEY = 'page'
const AUTO_NEXT_SECONDS = 135
const RING_R = 28
const RING_LENGTH = 2 * Math.PI * RING_R

const UI_COPY = {
  en: {
    menu: 'Reader controls',
    contents: 'Contents',
    contentsTitle: 'CONTENTS',
    cover: 'Cover',
    reflection: 'Reflection',
    of: 'of',
    bookmark: 'Bookmark this page',
    removeBookmark: 'Remove bookmark',
    removeBmFor: 'Remove bookmark for ',
    myBookmarks: 'BOOKMARKS',
    marksShort: 'Marks',
    bookmarksEmpty: 'Mark a page with the ribbon to keep it here.',
    perplexingQ: 'THINK OF IT...',
    production: 'An Aeternum Floreamus Production',
    prev: 'Previous page',
    next: 'Next page',
    language: 'LANGUAGE',
    theme: 'READING LIGHT',
    play: 'Play auto-turn',
    pause: 'Pause',
    loadingAudio: 'Loading audio…',
    audioReload: 'Audio unavailable — tap to retry',
    openBook: 'Open the book',
    close: 'Close',
    remindTitle: 'Your Bookmarked Pages',
    remindHint: 'Jump back to the pages you marked with the ribbon.',
    dontRemind: "Don't remind me this session",
  },
  it: {
    menu: 'Comandi di lettura',
    contents: 'Indice',
    contentsTitle: 'INDICE',
    cover: 'Copertina',
    reflection: 'Riflessione',
    of: 'di',
    bookmark: 'Aggiungi ai segnalibri',
    removeBookmark: 'Rimuovi segnalibro',
    removeBmFor: 'Rimuovi segnalibro per ',
    myBookmarks: 'SEGNALIBRI',
    marksShort: 'Segnali',
    bookmarksEmpty: 'Segna una pagina con il nastro per tenerla qui.',
    perplexingQ: 'PENSACI...',
    production: 'Una produzione Aeternum Floreamus',
    prev: 'Pagina precedente',
    next: 'Pagina successiva',
    language: 'LINGUA',
    theme: 'LUCE DI LETTURA',
    play: 'Avvia la lettura automatica',
    pause: 'Pausa',
    loadingAudio: 'Caricamento audio…',
    audioReload: 'Audio non disponibile — tocca per riprovare',
    openBook: 'Apri il libro',
    close: 'Chiudi',
    remindTitle: 'Le tue pagine segnalate',
    remindHint: 'Torna alle pagine che hai segnato con il nastro.',
    dontRemind: 'Non ricordarmelo in questa sessione',
  },
}

const ITALIAN_LOCALES = ['it', 'it-it', 'it-ch', 'it-sm', 'it-va']

const detectLang = () => {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'en' || saved === 'it') return saved
  } catch {
    /* ignore */
  }
  try {
    const navLang = (navigator.language || '').toLowerCase()
    if (ITALIAN_LOCALES.includes(navLang)) return 'it'
  } catch {
    /* ignore */
  }
  return 'en'
}

// currentPage semantics: 0 = cover, N => reflection N (bookData.pages[N - 1])
const readPageFromUrl = () => {
  try {
    const params = new URLSearchParams(window.location.search)
    const raw = parseInt(params.get(PAGE_ID_KEY), 10)
    if (!Number.isNaN(raw) && raw >= 1 && raw <= bookData.pages.length) return raw
  } catch {
    /* ignore */
  }
  return 0
}

// v2 format: { v: 2, list: [reflection numbers 1..101] }
const readBookmarks = () => {
  try {
    const raw = localStorage.getItem(BM_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && parsed.v === 2 && Array.isArray(parsed.list)) {
        return parsed.list
      }
      if (Array.isArray(parsed)) {
        const migrated = parsed
          .map((b) => (Number.isInteger(b) && b >= 1 ? b + 1 : null))
          .filter((b) => b !== null && b <= bookData.pages.length)
        return [...new Set(migrated)]
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

const localLc = (localized, lang) => (localized ? localized[lang] : '')

const renderFx = (txt) => {
  const parts = txt.split('∞')
  return parts.map((seg, i) => (
    <span key={i}>
      {seg}
      {i < parts.length - 1 && <span className="fx-infinity">∞</span>}
    </span>
  ))
}

function App() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('af-theme') || 'dim'
    } catch {
      return 'dim'
    }
  })
  const [lang, setLang] = useState(detectLang)
  const [currentPage, setCurrentPage] = useState(readPageFromUrl)
  const [bookmarks, setBookmarks] = useState(readBookmarks)
  const [anim, setAnim] = useState(null) // 'open' | 'close' | 'turn-next' | 'turn-prev'
  const [contentsOpen, setContentsOpen] = useState(false)
  const [bmOpen, setBmOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [remindBookmarks, setRemindBookmarks] = useState(true)
  const [bmOverlay, setBmOverlay] = useState(() => currentPage === 0 && bookmarks.length > 0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [helpTip, setHelpTip] = useState(null)
  const stageRef = useRef(null)
  const poemRef = useRef(null)
  const touchStartX = useRef(0)
  const animTimer = useRef(null)
  const audioRef = useRef(null)
  const isPlayingRef = useRef(false)
  const [audioWaiting, setAudioWaiting] = useState(false)
  const [audioError, setAudioError] = useState(false)
  const [audioDuration, setAudioDuration] = useState(0)

  const pages = bookData.pages
  const maxPage = pages.length
  const page = currentPage >= 1 ? pages[currentPage - 1] : null
  const copy = UI_COPY[lang]
  const isBookmarked = currentPage >= 1 && bookmarks.includes(currentPage)
  const isCover = currentPage === 0
  const interactCover = isCover && !anim
  const pageHasAudio = !!page && !!(page.audio && page.audio.en && page.audio.it)
  const audioUrl = pageHasAudio && page.audio ? (lang === 'it' ? page.audio.it : page.audio.en) : null
  const controlsHidden = isCover && !anim
  const animClass =
    anim === 'turn-next' ? 'turn-from-right'
      : anim === 'turn-prev' ? 'turn-from-left'
        : anim === 'open' ? 'reveal'
          : anim === 'close' ? 'conceal'
            : ''

  useEffect(() => {
    try {
      localStorage.setItem(BM_KEY, JSON.stringify({ v: 2, list: bookmarks }))
    } catch {
      /* storage unavailable */
    }
  }, [bookmarks])

  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      /* storage unavailable */
    }
    document.documentElement.setAttribute('lang', lang)
  }, [lang])

  useEffect(() => {
    try {
      localStorage.setItem('af-theme', theme)
    } catch {
      /* storage unavailable */
    }
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set(PAGE_ID_KEY, String(currentPage))
    const url = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState({}, '', url)
  }, [currentPage])

  useEffect(() => {
    const brand = 'ART OF BLOOMING FOREVER | AETERNUM FLOREAMUS 101'
    document.title = currentPage === 0
      ? `AETERNUM FLOREAMUS 101 | ${brand}`
      : `${localLc(pages[currentPage - 1].theme, lang)} | ${brand}`
  }, [currentPage, lang, pages])

  useEffect(() => {
    const el = stageRef.current
    if (el) el.scrollTo({ top: 0 })
  }, [currentPage, contentsOpen])

  useEffect(() => () => {
    if (animTimer.current) clearTimeout(animTimer.current)
  }, [])

  const goToPage = useCallback((idx) => {
    if (idx < 0 || idx > maxPage) return
    if (anim === 'open' || anim === 'close') return
    if (idx === 0 && bookmarks.length > 0 && remindBookmarks) setBmOverlay(true)
    else setBmOverlay(false)
    setContentsOpen(false)
    setBmOpen(false)
    setQuickOpen(false)
    setBmOverlay(false)
    if (idx === currentPage) return
    setElapsed(0)
    if (animTimer.current) {
      clearTimeout(animTimer.current)
      animTimer.current = null
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduce && currentPage === 0) {
      setAnim('open')
      setCurrentPage(idx)
      animTimer.current = setTimeout(() => { setAnim(null); animTimer.current = null }, 950)
    } else if (!reduce && idx === 0) {
      setAnim('close')
      animTimer.current = setTimeout(() => { setCurrentPage(0); setAnim(null); animTimer.current = null }, 950)
    } else if (!reduce) {
      setAnim(idx > currentPage ? 'turn-next' : 'turn-prev')
      setCurrentPage(idx)
      animTimer.current = setTimeout(() => { setAnim(null); animTimer.current = null }, 540)
    } else {
      setCurrentPage(idx)
    }
  }, [currentPage, maxPage, anim, bookmarks.length, remindBookmarks])

  const togglePlay = useCallback(() => {
    if (!pageHasAudio) return
    if (isPlaying && currentPage >= maxPage) {
      goToPage(0)
    }
    const el = audioRef.current
    const willPlay = audioError ? true : !isPlaying
    setIsPlaying(willPlay)
    if (el) {
      if (willPlay) {
        setAudioWaiting(true)
        setAudioError(false)
        if (audioError) {
          try { el.load() } catch { /* ignore */ }
        }
        if (window.matchMedia('(max-width: 900px)').matches && poemRef.current) {
          poemRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
        el.play().catch(() => {
          setAudioWaiting(false)
          setAudioError(true)
        })
      } else {
        el.pause()
      }
    }
  }, [isPlaying, currentPage, maxPage, goToPage, pageHasAudio, audioError])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    const el = audioRef.current
    if (!el || !audioUrl) {
      setAudioDuration(0)
      setAudioError(false)
      return
    }
    el.pause()
    try { el.currentTime = 0 } catch { /* ignore */ }
    setElapsed(0)
    setAudioDuration(0)
    setAudioError(false)
    if (isPlayingRef.current) {
      setAudioWaiting(true)
      el.play().catch(() => setAudioWaiting(false))
    } else {
      setAudioWaiting(false)
    }
  }, [currentPage, audioUrl])

  useEffect(() => {
    if (!isPlaying || isCover) {
      if (!isPlaying) return undefined
      const id = requestAnimationFrame(() => { setIsPlaying(false); setElapsed(0) })
      return () => cancelAnimationFrame(id)
    }
    if (currentPage >= maxPage) {
      const id = requestAnimationFrame(() => { setIsPlaying(false); setElapsed(0) })
      return () => cancelAnimationFrame(id)
    }
    const start = Date.now()
    const interval = setInterval(() => {
      const el = audioRef.current
      if (el && el.duration && Number.isFinite(el.currentTime)) setElapsed(el.currentTime)
      else setElapsed((Date.now() - start) / 1000)
    }, 250)
    return () => clearInterval(interval)
  }, [isPlaying, isCover, currentPage, maxPage])

  const cycleTheme = () => {
    const i = THEME_ORDER.indexOf(theme)
    setTheme(THEME_ORDER[(i + 1) % THEME_ORDER.length])
  }

  const nextThemeLabel = () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]
    return `${copy.theme}: ${lang === 'it' ? THEMES[next].labelIt : THEMES[next].labelEn}`
  }

  const toggleContents = () => {
    setContentsOpen((o) => {
      setIsPlaying(false)
      return !o
    })
    setBmOpen(false)
    setQuickOpen(false)
  }

  const closeQuick = () => {
    setQuickOpen(false)
    setBmOpen(false)
  }

  const toggleBookmark = useCallback((n) => {
    setBookmarks((prev) => (prev.includes(n) ? prev.filter((b) => b !== n) : [...prev, n]))
  }, [])

  const showHelp = (e, text) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHelpTip({ text, x: r.left + r.width / 2, y: r.top - 6 })
  }
  const hideHelp = () => setHelpTip(null)

  useEffect(() => {
    const handleKey = (e) => {
if (e.key === 'Escape') {
        setContentsOpen(false)
        setBmOpen(false)
        setQuickOpen(false)
        setBmOverlay(false)
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goToPage(currentPage + 1) }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goToPage(currentPage - 1) }
      if (e.key === 'Home') { e.preventDefault(); goToPage(0) }
      if (e.key === 'End') { e.preventDefault(); goToPage(maxPage) }
      if (e.key === ' ' && !e.repeat && e.target === document.body) {
        e.preventDefault()
        if (isCover) goToPage(1)
        else if (pageHasAudio) togglePlay()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentPage, maxPage, isCover, goToPage, togglePlay, pageHasAudio])

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd = (e) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 60) {
      if (diff > 0) goToPage(currentPage + 1)
      else goToPage(currentPage - 1)
    }
  }

  const renderTocRow = (p, i) => (
    <button
      key={i}
      className={`toc-row ${currentPage === i + 1 ? 'here' : ''}`}
      onClick={() => goToPage(i + 1)}
    >
      <span className="toc-num">{p.number}</span>
      <span className="toc-theme">{localLc(p.theme, lang)}</span>
      <span className="toc-lead" />
      <span className="toc-folio">{(i + 1) * 2}</span>
    </button>
  )

  const contentsBtn = (
    <button className="ctl-btn contents-btn" onClick={toggleContents} aria-pressed={contentsOpen} aria-label={copy.contents}>
      <span className="ctl-ico" aria-hidden="true">☰</span>
      <span className="ctl-lbl">{copy.contents}</span>
    </button>
  )

  const playWrapEl = pageHasAudio ? (
    <div className={`play-wrap ${audioError ? 'has-error' : ''} ${audioWaiting ? 'is-loading' : ''}`}>
      <svg className="play-ring" viewBox="0 0 64 64" aria-hidden="true">
        <circle className="ring-track" cx="32" cy="32" r={RING_R} />
        <circle
          className="ring-progress"
          cx="32"
          cy="32"
          r={RING_R}
          style={{
            strokeDasharray: RING_LENGTH,
            strokeDashoffset: RING_LENGTH * (1 - Math.min(elapsed / (audioDuration || AUTO_NEXT_SECONDS), 1)),
          }}
        />
      </svg>
      <button
        className="play-btn"
        onClick={togglePlay}
        aria-label={audioError ? (isPlaying ? copy.pause : copy.audioReload) : audioWaiting ? copy.loadingAudio : (isPlaying ? copy.pause : copy.play)}
        onMouseEnter={(e) => showHelp(e, audioError ? (isPlaying ? copy.pause : copy.audioReload) : audioWaiting ? copy.loadingAudio : (isPlaying ? copy.pause : copy.play))}
        onMouseLeave={hideHelp}
        onFocus={(e) => showHelp(e, audioError ? (isPlaying ? copy.pause : copy.audioReload) : audioWaiting ? copy.loadingAudio : (isPlaying ? copy.pause : copy.play))}
        onBlur={hideHelp}
      >
        {audioWaiting ? <span className="spin" aria-hidden="true" /> : audioError ? <span className="reload-ico" aria-hidden="true">↻</span> : (isPlaying ? '⏸' : '▶')}
      </button>
    </div>
  ) : null

  const transportEl = (
    <div className="transport">
      <button className="nav-btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 0} aria-label={copy.prev}>
        ❮
      </button>
      {playWrapEl}
      <button className="nav-btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= maxPage} aria-label={copy.next}>
        ❯
      </button>
    </div>
  )

  const quickMenuToggle = (o) => {
    const willOpen = !o
    if (willOpen) {
      const el = audioRef.current
      if (el) el.pause()
      if (isPlayingRef.current) {
        setIsPlaying(false)
        setElapsed(0)
      }
    }
    setQuickOpen(willOpen)
    setBmOpen(false)
  }

  const marksWrapEl = (
    <div className="ctl-holder">
      <button
        className="ctl-btn marks-btn"
        onClick={() => setBmOpen((o) => !o)}
        aria-expanded={bmOpen}
        aria-label={copy.myBookmarks}
        onMouseEnter={(e) => showHelp(e, copy.myBookmarks)}
        onMouseLeave={hideHelp}
        onFocus={(e) => showHelp(e, copy.myBookmarks)}
        onBlur={hideHelp}
      >
        <span className="ctl-ico" aria-hidden="true">❧</span>
        <span className="ctl-lbl">{copy.marksShort}</span>
        {bookmarks.length > 0 && <span className="marks-count">{bookmarks.length}</span>}
      </button>

      {bmOpen && (
        <>
          <div className="pop-backdrop" onClick={() => setBmOpen(false)} />
          <div className="popover bm-pop" role="dialog" aria-label={copy.myBookmarks}>
            <div className="pop-title">
              {bookmarks.length > 0 ? `${copy.myBookmarks} (${bookmarks.length})` : copy.myBookmarks}
            </div>
            <button
              className={`pop-toggle ${isBookmarked ? 'marked' : ''}`}
              onClick={() => toggleBookmark(currentPage)}
            >
              <span className="pop-toggle-ico" aria-hidden="true">{isBookmarked ? '◆' : '◇'}</span>
              {isBookmarked ? copy.removeBookmark : copy.bookmark}
            </button>
            {bookmarks.length === 0 ? (
              <p className="pop-empty">{copy.bookmarksEmpty}</p>
            ) : (
              <div className="pop-list">
                {[...bookmarks].sort((a, b) => a - b).map((b) => (
                  <div className="pop-row" key={b}>
                    <button className="pop-row-go" onClick={() => goToPage(b)}>
                      <span className="toc-num">{pages[b - 1].number}</span>
                      <span className="pop-row-theme">{localLc(pages[b - 1].theme, lang)}</span>
                    </button>
                    <button
                      className="pop-row-x"
                      aria-label={`${copy.removeBmFor}${localLc(pages[b - 1].theme, lang)}`}
                      onClick={() => toggleBookmark(b)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )

  const langSegEl = (
    <div className="lang-seg" role="group" aria-label={copy.language}>
      <button className={`lang-opt ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')} aria-pressed={lang === 'en'}>
        EN
      </button>
      <button className={`lang-opt ${lang === 'it' ? 'active' : ''}`} onClick={() => setLang('it')} aria-pressed={lang === 'it'}>
        IT
      </button>
    </div>
  )

  const lightBtnEl = (
    <button
      className="ctl-btn light-btn"
      onClick={cycleTheme}
      aria-label={nextThemeLabel()}
      onMouseEnter={(e) => showHelp(e, nextThemeLabel())}
      onMouseLeave={hideHelp}
      onFocus={(e) => showHelp(e, nextThemeLabel())}
      onBlur={hideHelp}
    >
      <span className="ctl-ico" aria-hidden="true">{THEMES[theme].icon}</span>
    </button>
  )

  return (
    <div
      className={`book-app theme-${theme}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        preload="auto"
        onWaiting={() => { setAudioWaiting(true); setAudioError(false) }}
        onStalled={() => { setAudioWaiting(true); setAudioError(false) }}
        onPlaying={() => { setAudioWaiting(false); setAudioError(false) }}
        onCanPlay={() => { setAudioWaiting(false); setAudioError(false) }}
        onLoadedData={() => { setAudioWaiting(false); setAudioError(false) }}
        onError={() => { setAudioWaiting(false); setAudioError(true); setIsPlaying(false); setElapsed(0) }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          setAudioDuration(Number.isFinite(d) && d > 0 ? d : 0)
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration
          setAudioDuration(Number.isFinite(d) && d > 0 ? d : 0)
        }}
        onEnded={() => {
          setIsPlaying(false)
          setElapsed(0)
          setAudioWaiting(false)
        }}
      />
      <main ref={stageRef} className="stage">
        <div className="lamp-glow" aria-hidden="true" />

        {!isCover && !anim && (
          <>
            <button className="edge-nav edge-prev" onClick={() => goToPage(currentPage - 1)} aria-label={copy.prev} tabIndex={-1}>
              ❮
            </button>
            <button className="edge-nav edge-next" onClick={() => goToPage(currentPage + 1)} aria-label={copy.next} tabIndex={-1}>
              ❯
            </button>
          </>
        )}

        {/* ---- CLOSED HARDCOVER COVER ---- */}
        {(isCover || anim === 'open' || anim === 'close') && (
          <div
            className={`cover-scene ${anim === 'open' ? 'is-opening' : ''} ${anim === 'close' ? 'is-closing' : ''} ${interactCover ? 'interactive' : ''}`}
            role="button"
            tabIndex={interactCover ? 0 : -1}
            aria-label={copy.openBook}
            onClick={() => { if (interactCover) goToPage(1) }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && interactCover) {
                e.preventDefault()
                goToPage(1)
              }
            }}
          >
            <div className="closed-book">
              <div className="book-foredge" aria-hidden="true" />
              <div className="page-block" aria-hidden="true" />
              <div className="book-spine" aria-hidden="true">
                <span className="spine-title">Aeternum Floreamus</span>
              </div>
              <div className="front-cover">
                <div className="cover-frame">
                  <div className="cover-crest" aria-hidden="true">❦</div>
                  <div className="cover-mid">
                    <h1 className="cover-title">AETERNUM<br />FLOREAMUS</h1>
                    <div className="cover-rule" aria-hidden="true"><i /><span>✦</span><i /></div>
                    <div className="cover-number">101</div>
                    <p className="cover-subtitle">{renderFx(lang === 'it' ? bookData.subtitleIt : bookData.subtitle)}</p>
                  </div>
                  <div className="cover-bottom">
                    <div className="cover-publisher">{bookData.publisher}</div>
                    <div className="cover-production">{copy.production}</div>
                  </div>
                </div>
              </div>
            </div>
            {interactCover && (
              <div className="open-hint" aria-hidden="true">
                <span className="open-hint-text">{copy.openBook}</span>
                <span className="open-hint-arrow">❯</span>
              </div>
            )}
          </div>
        )}

        {/* ---- OPEN REFLECTION SPREAD ---- */}
        {((!isCover || anim === 'close') && !contentsOpen) && (
          <article className={`spread refl-spread ${animClass}`} key={`p-${currentPage}-${anim}`}>
            <div className="gutter" aria-hidden="true" />
            <button
              className={`ribbon ${isBookmarked ? 'marked' : ''}`}
              onClick={() => page && toggleBookmark(currentPage)}
              aria-label={isBookmarked ? copy.removeBookmark : copy.bookmark}
              aria-pressed={isBookmarked}
              title={isBookmarked ? copy.removeBookmark : copy.bookmark}
            />

            <section className="leaf leaf--verso">
              <div className="grain" aria-hidden="true" />
              <header className="running-head"><span>AETERNUM FLOREAMUS</span></header>
              <div className="leaf-body">
                <div className="chapter-mark" aria-hidden="true">❦</div>
                <h2 className="theme-display">{localLc(page.theme, lang)}</h2>
                <div className="ornament-rule" aria-hidden="true"><i /><span>✦</span><i /></div>
                <div className="poetry" ref={poemRef}>
                  <div className="poetry-col">
                    {page.poetry.slice(0, Math.ceil(page.poetry.length / 2)).map((line, i) => (
                      <p className="poetry-line" key={i}>{localLc(line, lang)}</p>
                    ))}
                  </div>
                  <div className="poetry-col">
                    {page.poetry.slice(Math.ceil(page.poetry.length / 2)).map((line, i) => (
                      <p className="poetry-line" key={i}>{localLc(line, lang)}</p>
                    ))}
                  </div>
                </div>
              </div>
              <footer className="folio"><span>{currentPage * 2}</span></footer>
            </section>

            <section className="leaf leaf--recto">
              <div className="grain" aria-hidden="true" />
              <header className="running-head"><span>{localLc(page.theme, lang)}</span></header>
              <div className="leaf-body">
                <blockquote className="pull-quote">
                  <span className="quote-mark" aria-hidden="true">“</span>
                  <p className="quote-text">{localLc(page.quote, lang)}</p>
                  <cite className="quote-attr">— {page.author}</cite>
                </blockquote>
                <div className="fleuron-divider" aria-hidden="true">❧</div>
                <h3 className="section-head">{copy.perplexingQ}</h3>
                <div className="question">
                  {(Array.isArray(page.perplexing_question)
                    ? page.perplexing_question
                    : [page.perplexing_question]
                  ).map((line, i) => (
                    <p className="question-line" key={i}>{localLc(line, lang)}</p>
                  ))}
                </div>
                <div className="colophon">{copy.production}</div>
              </div>
              <footer className="folio"><span>{currentPage * 2 + 1}</span></footer>
            </section>
          </article>
        )}

        {/* ---- CONTENTS / FRONT MATTER ---- */}
        {contentsOpen && (
          <article className="spread contents-spread" key="contents">
            <div className="gutter" aria-hidden="true" />

            <section className="leaf leaf--verso">
              <div className="grain" aria-hidden="true" />
              <header className="running-head"><span>AETERNUM FLOREAMUS</span></header>
              <div className="leaf-body">
                <h2 className="contents-title">{copy.contentsTitle}</h2>
                <div className="ornament-rule" aria-hidden="true"><i /><span>☙</span><i /></div>
                <div className="toc-columns">
                  {pages.slice(0, 51).map((p, i) => renderTocRow(p, i))}
                </div>
              </div>
              <footer className="folio"><span>ii</span></footer>
            </section>

            <section className="leaf leaf--recto">
              <div className="grain" aria-hidden="true" />
              <header className="running-head"><span>{copy.contentsTitle}</span></header>
              <div className="leaf-body">
                <div className="toc-open-seal" aria-hidden="true">❦</div>
                <div className="toc-columns">
                  {pages.slice(51).map((p, i) => renderTocRow(p, i + 51))}
                </div>
              </div>
              <footer className="folio"><span>iii</span></footer>
            </section>
          </article>
        )}
      </main>

      {/* ---- READER CONTROLS ---- */}
      <nav className={`reader-controls ${controlsHidden ? 'is-hidden' : ''}`} aria-label={copy.menu}>
        <div className="control-rail">
          {contentsBtn}

          {transportEl}

          <div className="control-meta">
            <span className="pos-label">
              <span className="pos-full">
                {contentsOpen ? copy.contents : currentPage === 0 ? copy.cover : `${copy.reflection} ${currentPage} ${copy.of} ${maxPage}`}
              </span>
              <span className="pos-short">{contentsOpen ? '—' : `${currentPage} / ${maxPage}`}</span>
            </span>

            <div className="right-cluster">
              {marksWrapEl}

              {langSegEl}

              {lightBtnEl}
            </div>
          </div>
        </div>

        {helpTip && (
          <div className="seg-tooltip" style={{ left: helpTip.x, top: helpTip.y }}>
            <span className="seg-tooltip-text">{helpTip.text}</span>
          </div>
        )}
      </nav>

      {/* ---- MOBILE PLAYER BAR ---- */}
      <div className={`player-bar ${controlsHidden ? 'is-hidden' : ''}`}>
        <button className="mini-nav" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 0} aria-label={copy.prev}>
          ❮
        </button>
        {!isCover && playWrapEl}
        <button
          className={`menu-fab ${quickOpen ? 'open' : ''}`}
          onClick={() => quickMenuToggle(quickOpen)}
          aria-label={copy.menu}
          aria-expanded={quickOpen}
        >
          {quickOpen ? '✕' : '☰'}
        </button>
        <button className="mini-nav" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= maxPage} aria-label={copy.next}>
          ❯
        </button>
      </div>

      {quickOpen && !isCover && (
        <>
          <div className="quick-backdrop" onClick={closeQuick} />
          <div className="quick-menu" role="dialog" aria-label={copy.menu}>
            <div className="quick-head">
              <span className="quick-label">
                {contentsOpen ? copy.contents : `${copy.reflection} ${currentPage} ${copy.of} ${maxPage}`}
              </span>
              <button className="quick-close" onClick={closeQuick} aria-label={copy.close}>✕</button>
            </div>

            <div className="quick-rows">
              <div className="quick-row">
                {contentsBtn}
                {marksWrapEl}
              </div>
              <div className="quick-row">
                {langSegEl}
                {lightBtnEl}
              </div>
            </div>
          </div>
        </>
      )}

      {bmOverlay && isCover && (
        <div className="bm-reminder" role="dialog" aria-label={copy.remindTitle}>
          <div className="bm-reminder-card">
            <div className="bm-reminder-head">
              <span>{copy.remindTitle}</span>
              <button className="quick-close" onClick={() => setBmOverlay(false)} aria-label={copy.close}>✕</button>
            </div>
            <p className="bm-reminder-hint">{copy.remindHint}</p>
            <div className="bm-reminder-list">
              {[...bookmarks].sort((a, b) => a - b).map((b) => {
                const bp = pages[b - 1]
                return (
                  <button key={b} className="bm-reminder-row" onClick={() => goToPage(b)}>
                    <span className="bm-reminder-num">{bp.number}</span>
                    <span className="bm-reminder-theme">{localLc(bp.theme, lang)}</span>
                    <span className="bm-reminder-folio">{b * 2}</span>
                  </button>
                )
              })}
            </div>
            <label className="bm-reminder-mute">
              <input
                type="checkbox"
                checked={!remindBookmarks}
                onChange={(e) => { setRemindBookmarks(!e.target.checked); setBmOverlay(false) }}
              />
              <span>{copy.dontRemind}</span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

export default App