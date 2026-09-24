document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const languageButtons = document.querySelectorAll('[data-set-language]');
  function setLanguage(language, remember) {
    language = language === 'ko' ? 'ko' : 'en';
    document.documentElement.lang = language;
    document.querySelectorAll('[data-language]').forEach(function (element) {
      element.hidden = element.dataset.language !== language;
    });
    languageButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.setLanguage === language));
    });
    document.title = language === 'ko'
      ? '로봇 손을 이용한 스쿠핑 파지 (Diffusion Policy 롤아웃 포함) | 엄승환'
      : 'Scooping Grasping with Robotic Hand (with Diffusion Policy Rollouts) | Seunghwan Um';
    if (remember) {
      try { localStorage.setItem('scooping-language', language); } catch (_) {}
    }
    // Both translations are static DOM nodes, typeset once at MathJax startup.
    // Language changes only toggle visibility; another typeset can race startup.
    schedulePlayback();
  }
  languageButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      setLanguage(button.dataset.setLanguage, true);
    });
  });
  const burger = document.querySelector('.navbar-burger');
  const menu = document.querySelector('.navbar-menu');
  burger.addEventListener('click', function () {
    const expanded = burger.getAttribute('aria-expanded') !== 'true';
    burger.setAttribute('aria-expanded', String(expanded));
    burger.classList.toggle('is-active', expanded);
    menu.classList.toggle('is-active', expanded);
    schedulePlayback();
  });

  const states = Array.from(document.querySelectorAll('video, .publication-video iframe')).map(function (element) {
    return { element: element, active: false, player: null, ready: false, loading: false };
  });
  const pair = states.filter(function (state) {
    return state.element.id === 'comparison1-with' || state.element.id === 'comparison1-without';
  });
  function shouldPlay(state) {
    if (document.hidden || state.element.closest('details:not([open])')) return false;
    const rect = state.element.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.right <= 0 || rect.left >= window.innerWidth) return false;
    const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    return visibleHeight >= Math.min(rect.height, window.innerHeight) * 0.35;
  }
  function playVideo(state) {
    const video = state.element;
    if (video.ended) video.currentTime = 0;
    const partner = pair.includes(state) && pair.find(function (other) {
      return other !== state && shouldPlay(other) && !other.element.paused && !other.element.ended;
    });
    if (partner && video.readyState > 0) {
      video.currentTime = Math.min(partner.element.currentTime, video.duration || Infinity);
    }
    // Native controls remain usable when browser policy blocks autoplay.
    const playback = video.play();
    if (playback) playback.then(function () {
      if (!shouldPlay(state)) video.pause();
    }).catch(function () {});
  }

  let youtubeAPI;
  function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (!youtubeAPI) youtubeAPI = new Promise(function (resolve, reject) {
      window.onYouTubeIframeAPIReady = function () { resolve(window.YT); };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return youtubeAPI;
  }
  function playYouTube(state) {
    if (state.ready) {
      if (state.player.getPlayerState() === 0) state.player.seekTo(0, true);
      state.player.playVideo();
      return;
    }
    if (state.loading) return;
    state.loading = true;
    loadYouTubeAPI().then(function (YT) {
      new YT.Player(state.element.id, {
        events: {
          onReady: function (event) {
            state.player = event.target;
            state.element = event.target.getIframe();
            state.ready = true;
            state.player.mute();
            if (shouldPlay(state)) state.player.playVideo();
            else state.player.pauseVideo();
          },
          onStateChange: function (event) {
            if (event.data === 1 && !shouldPlay(state)) event.target.pauseVideo();
          }
        }
      });
    }).catch(function () { state.loading = false; });
  }

  function updatePlayback() {
    states.forEach(function (state) {
      const active = shouldPlay(state);
      if (active === state.active) return;
      state.active = active;
      if (state.element.tagName === 'VIDEO') {
        if (active) playVideo(state);
        else state.element.pause();
      } else if (active) playYouTube(state);
      else if (state.ready) state.player.pauseVideo();
    });
  }
  let scheduledFrame = null;
  function schedulePlayback() {
    if (scheduledFrame !== null) return;
    scheduledFrame = window.requestAnimationFrame(function () {
      scheduledFrame = null;
      updatePlayback();
    });
  }
  states.forEach(function (state) {
    if (state.element.tagName === 'VIDEO') {
      state.element.muted = true;
      state.element.addEventListener('loadedmetadata', schedulePlayback);
      state.element.addEventListener('play', function () {
        if (!shouldPlay(state)) state.element.pause();
      });
    } else {
      const url = new URL(state.element.src);
      url.searchParams.set('origin', window.location.origin);
      state.element.src = url.href;
    }
  });
  // Batch geometry reads once per frame; also handle videos taller than the viewport.
  window.addEventListener('scroll', schedulePlayback, { passive: true });
  window.addEventListener('resize', schedulePlayback);
  window.addEventListener('load', schedulePlayback);
  document.addEventListener('visibilitychange', updatePlayback);
  document.querySelectorAll('details').forEach(function (details) {
    details.addEventListener('toggle', updatePlayback);
  });
  if (window.ResizeObserver) new ResizeObserver(schedulePlayback).observe(document.body);
  document.getElementById('restart-comparison').addEventListener('click', function () {
    pair.forEach(function (state) { state.element.currentTime = 0; });
    pair.forEach(function (state) {
      if (shouldPlay(state)) playVideo(state);
    });
  });
  let language = 'en';
  try { language = localStorage.getItem('scooping-language') || 'en'; } catch (_) {}
  setLanguage(language, false);
});
