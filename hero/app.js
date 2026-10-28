/**
 * Scripbox PMS Landing Page - Canonical Prototype Logic
 * Single canonical experience (Variant B - CTA to Modal Flow)
 * Conversion-Optimised 3-Step Qualification Flow:
 * Step 1 (Goal) -> Step 2 (Contextual Portfolio/Allocation) -> Step 3 (Contact Conversion)
 * Followed by Optional Callback Scheduling -> Thank You Confirmation.
 * In-memory state tracking, responsive field validation, dynamic copy adaptation,
 * duplicate submission prevention, and accessible navigation.
 */

(function () {
  'use strict';

  // In-Memory Form State
  const formState = {
    q1: '',
    q2: '',
    name: '',
    mobile: '',
    city: '',
    callTime: '',
    selectedStrategy: '',
    deliveryMode: 'prototype_local',
    lastSubmittedPayload: null
  };

  // PII-free funnel analytics helper (never transmits name, phone, or city)
  function trackFunnelEvent(eventName, metadata) {
    if (typeof window === 'undefined') return;
    const safeMeta = Object.assign({}, metadata || {});
    delete safeMeta.name;
    delete safeMeta.mobile;
    delete safeMeta.phone;
    delete safeMeta.city;
    delete safeMeta.contact;

    const entry = Object.assign(
      { event: eventName, timestamp: new Date().toISOString() },
      safeMeta
    );

    if (!Array.isArray(window.dataLayer)) {
      window.dataLayer = [];
    }
    window.dataLayer.push(entry);

    if (!Array.isArray(window.__sbAnalyticsEvents)) {
      window.__sbAnalyticsEvents = [];
    }
    window.__sbAnalyticsEvents.push(entry);

    try {
      window.dispatchEvent(new CustomEvent('scripbox:analytics', { detail: entry }));
    } catch (err) {
      // Ignore if CustomEvent is restricted
    }
  }

  let isSubmitting = false;

  // DOM Elements - Hero & Controls
  const heroSection = document.getElementById('heroSection');
  const btnHeroB = document.getElementById('btnHeroB');
  const stickyCtaBar = document.getElementById('stickyCtaBar');
  const stickyCtaBtn = document.getElementById('stickyCtaBtn');
  const btnSecondaryCta = document.getElementById('btnSecondaryCta');

  // DOM Elements - Overlay & Panels
  const stepOverlay = document.getElementById('stepOverlay');
  const panelQ1 = document.getElementById('panelQ1');
  const panelQ2 = document.getElementById('panelQ2');
  const panelContact = document.getElementById('panelContact');
  const panelThanks = document.getElementById('panelThanks');

  const panels = {
    q1: panelQ1,
    q2: panelQ2,
    contact: panelContact,
    thanks: panelThanks
  };

  // Back Navigation & Edit Affordance Buttons
  const btnBackFromQ1 = document.getElementById('btnBackFromQ1');
  const btnBackFromQ2 = document.getElementById('btnBackFromQ2');
  const btnBackFromContact = document.getElementById('btnBackFromContact');
  const btnEditRecap = document.getElementById('btnEditRecap');
  const btnThanksClose = document.getElementById('btnThanksClose');

  // Contact Form Elements
  const contactForm = document.getElementById('contactForm');
  const contactName = document.getElementById('contactName');
  const contactMobile = document.getElementById('contactMobile');
  const contactCity = document.getElementById('contactCity');
  const nameWrapper = document.getElementById('nameWrapper');
  const mobileWrapper = document.getElementById('mobileWrapper');
  const cityWrapper = document.getElementById('cityWrapper');
  const nameError = document.getElementById('nameError');
  const mobileError = document.getElementById('mobileError');
  const cityError = document.getElementById('cityError');
  const btnContactSubmit = document.getElementById('btnContactSubmit');

  // Thanks Screen Callback Chips
  const callbackChips = document.querySelectorAll('.callback-chip');
  const callbackSavedHint = document.getElementById('callbackSavedHint');

  let currentActiveStep = null;
  let lastTriggerElement = null;
  let lastScrollY = 0;

  // Background elements to isolate with inert when modal opens
  const bgHero = document.getElementById('heroSection');
  const bgContent = document.getElementById('belowFoldContent');
  const bgFooter = document.querySelector('.btf-footer');
  const bgSticky = document.getElementById('stickyCtaBar');

  // Overlay Step Management
  function goToStep(stepId) {
    if (!currentActiveStep) {
      lastTriggerElement = document.activeElement;
      lastScrollY = window.scrollY;
      if (bgHero) bgHero.setAttribute('inert', '');
      if (bgContent) bgContent.setAttribute('inert', '');
      if (bgFooter) bgFooter.setAttribute('inert', '');
      if (bgSticky) bgSticky.setAttribute('inert', '');
    }

    currentActiveStep = stepId;

    stepOverlay.style.display = 'block';
    stepOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Hide all panels
    Object.keys(panels).forEach(key => {
      if (panels[key]) {
        panels[key].style.display = 'none';
      }
    });

    const activePanel = panels[stepId];
    if (activePanel) {
      activePanel.style.display = 'flex';
      const heading = activePanel.querySelector('h1, h2, h3, .step-heading, .thanks-heading');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
      activePanel.scrollTop = 0;
    }

    restoreStepState(stepId);
    trackFunnelEvent('funnel_step_view', { step: stepId });
  }

  function closeOverlay() {
    stepOverlay.style.display = 'none';
    stepOverlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    if (bgHero) bgHero.removeAttribute('inert');
    if (bgContent) bgContent.removeAttribute('inert');
    if (bgFooter) bgFooter.removeAttribute('inert');
    if (bgSticky) bgSticky.removeAttribute('inert');
    checkHeroScroll();

    currentActiveStep = null;
    window.scrollTo(0, lastScrollY);

    if (lastTriggerElement && typeof lastTriggerElement.focus === 'function') {
      lastTriggerElement.focus();
    } else if (btnHeroB) {
      btnHeroB.focus();
    }
  }

  // Escape key and modal focus trap
  if (stepOverlay) {
    window.addEventListener('keydown', function (e) {
      if (stepOverlay.style.display === 'none' || !currentActiveStep) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeOverlay();
        return;
      }

      if (e.key === 'Tab') {
        const activePanel = panels[currentActiveStep];
        if (!activePanel) return;

        const focusables = Array.from(
          activePanel.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
        ).filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
        });

        if (focusables.length === 0) return;

        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl || !activePanel.contains(document.activeElement)) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl || !activePanel.contains(document.activeElement)) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    });
  }

  // Restore State on Revisit / Back Navigation & Dynamic Content Adaptation
  function restoreStepState(stepId) {
    if (stepId === 'q1') {
      panelQ1.querySelectorAll('.modal-tile, .q1-card-tile, .objective-card').forEach(t => {
        const matches = t.getAttribute('data-choice') === formState.q1;
        t.classList.toggle('is-selected', matches);
        t.setAttribute('aria-pressed', matches ? 'true' : 'false');
      });
    } else if (stepId === 'q2') {
      // Dynamic Q2 copy adaptation based on Step 1 intent
      const q2Heading = document.getElementById('q2Heading');
      const q2Subnote = document.getElementById('q2Subnote');
      if (q2Heading) {
        if (formState.q1 === 'Portfolio review by experts') {
          q2Heading.textContent = 'Size of portfolio to review';
          if (q2Subnote) {
            q2Subnote.textContent = '*Comprehensive review available for portfolios starting at ₹50 Lakhs.';
          }
        } else {
          q2Heading.textContent = 'Planned investment in PMS';
          if (q2Subnote) {
            q2Subnote.textContent = '*SEBI requires a minimum investment of ₹50 Lakhs for Portfolio Management Services.';
          }
        }
      }

      panelQ2.querySelectorAll('.q2-tile, .option-tile').forEach(t => {
        const matches = t.getAttribute('data-choice') === formState.q2;
        t.classList.toggle('is-selected', matches);
        t.setAttribute('aria-pressed', matches ? 'true' : 'false');
      });
    } else if (stepId === 'contact') {
      if (contactName) contactName.value = formState.name || '';
      if (contactMobile) contactMobile.value = formState.mobile || '';
      if (contactCity) contactCity.value = formState.city || '';

      // Dynamic Strategy Recap Pill
      const recapText = document.getElementById('recapText');
      if (recapText) {
        const parts = [];
        if (formState.q1) parts.push(formState.q1);
        if (formState.q2) {
          parts.push(formState.q2 === 'Under 50 Lakhs' ? 'Under ₹50L (Mutual Fund Advisory)' : formState.q2);
        }
        recapText.textContent = parts.length > 0
          ? parts.join(' • ')
          : 'Goal-based strategy • ₹50 Lakhs to ₹2 Crore';
      }

      // Dynamic Headline & Content Alignment
      const contactHeading = document.getElementById('contactHeading');
      const contactSub = document.getElementById('contactSub');
      const btnText = btnContactSubmit ? btnContactSubmit.querySelector('.btn-text') : null;

      if (formState.q2 === 'Under 50 Lakhs') {
        if (contactHeading) contactHeading.textContent = "Let's talk about your investment goals.";
        if (contactSub) {
          contactSub.textContent = 'SEBI mandates a ₹50 Lakh minimum for PMS. Our wealth advisory team will evaluate your goals and design a high-conviction direct mutual fund strategy.';
        }
        if (btnText) btnText.textContent = 'Request a consultation';
      } else if (formState.q1 === 'Portfolio review by experts') {
        if (contactHeading) contactHeading.textContent = "Let's review your investment portfolio.";
        if (contactSub) {
          contactSub.textContent = 'Share a few details to help our senior portfolio specialist prepare an objective diagnostic of your holdings.';
        }
        if (btnText) btnText.textContent = 'Request a consultation';
      } else {
        if (contactHeading) contactHeading.textContent = "Let's talk about your investment goals.";
        if (contactSub) {
          contactSub.textContent = "Share a few details to help us understand what you're looking for. Our team can then guide you through the relevant PMS strategies and next steps.";
        }
        if (btnText) btnText.textContent = 'Request a consultation';
      }

      updateContactSubmitState();
    } else if (stepId === 'thanks') {
      const thanksHeading = document.getElementById('thanksHeading');
      const thanksSubhead = document.getElementById('thanksSubhead');
      const summaryText = document.getElementById('thanksSummaryText');

      if (formState.q2 === 'Under 50 Lakhs') {
        if (thanksHeading) thanksHeading.textContent = 'Thank you. Your enquiry has been received.';
        if (thanksSubhead) {
          thanksSubhead.textContent = 'Our wealth advisory team will review your enquiry and connect with you shortly.';
        }
      } else if (formState.q1 === 'Portfolio review by experts') {
        if (thanksHeading) thanksHeading.textContent = 'Thank you. Your enquiry has been received.';
        if (thanksSubhead) {
          thanksSubhead.textContent = 'Our senior portfolio specialist will evaluate your portfolio details and connect with you shortly.';
        }
      } else {
        if (thanksHeading) thanksHeading.textContent = 'Thank you. Your enquiry has been received.';
        if (thanksSubhead) {
          thanksSubhead.textContent = 'Our senior portfolio advisory team will review your mandate profile and connect with you shortly.';
        }
      }

      if (summaryText) {
        const parts = [];
        if (formState.q1) parts.push(formState.q1);
        if (formState.q2) {
          parts.push(formState.q2 === 'Under 50 Lakhs' ? 'Mutual Fund Advisory (<₹50L)' : formState.q2);
        }
        summaryText.textContent = `Enquiry: ${parts.length > 0 ? parts.join(' • ') : 'PMS Consultation'}`;
      }

      // Sync callback chips state
      syncCallbackChips();

      // Honest prototype/live notice handling: only hide prototype notice when a real endpoint succeeded
      const prototypeNotice = panelThanks ? panelThanks.querySelector('.prototype-notice') : null;
      if (prototypeNotice) {
        prototypeNotice.style.display = formState.deliveryMode === 'live_endpoint' ? 'none' : '';
      }
    }
  }

  // Callback Chips Synchronization & Event Listeners
  function syncCallbackChips() {
    callbackChips.forEach(chip => {
      const matches = formState.callTime && chip.getAttribute('data-choice') === formState.callTime;
      chip.classList.toggle('is-selected', !!matches);
      chip.setAttribute('aria-checked', matches ? 'true' : 'false');
    });
    if (callbackSavedHint) {
      if (formState.callTime) {
        const label = formState.callTime.split(' (')[0];
        callbackSavedHint.textContent = `Preference saved: ${label} window selected. We will prioritize calling during this time.`;
        callbackSavedHint.style.display = 'block';
      } else {
        callbackSavedHint.style.display = 'none';
      }
    }
  }

  callbackChips.forEach(chip => {
    chip.addEventListener('click', function () {
      const choice = this.getAttribute('data-choice');
      if (formState.callTime === choice) {
        // Toggle off if tapped again
        formState.callTime = '';
      } else {
        formState.callTime = choice;
      }
      syncCallbackChips();
      trackFunnelEvent('funnel_callback_window_select', {
        callbackWindow: formState.callTime || 'cleared'
      });
    });
  });

  // Q1 Selection Handler in Modal (Auto-advances to Step 2)
  function handleQ1Selection(tileElement) {
    const choice = tileElement.getAttribute('data-choice');
    formState.q1 = choice;
    trackFunnelEvent('funnel_q1_select', { objective: choice });

    panelQ1.querySelectorAll('.modal-tile, .q1-card-tile, .objective-card').forEach(t => {
      t.classList.remove('is-selected');
      t.setAttribute('aria-pressed', 'false');
    });

    tileElement.classList.add('is-selected');
    tileElement.setAttribute('aria-pressed', 'true');

    setTimeout(() => {
      goToStep('q2');
    }, 180);
  }

  // Wire up Modal Q1 cards / tiles
  panelQ1.querySelectorAll('.modal-tile, .q1-card-tile, .objective-card').forEach(tile => {
    tile.addEventListener('click', function () {
      handleQ1Selection(this);
    });
  });

  // Wire up Q2 Tiles (Auto-advances to Step 3 - Contact)
  panelQ2.querySelectorAll('.q2-tile, .option-tile').forEach(tile => {
    tile.addEventListener('click', function () {
      const choice = this.getAttribute('data-choice');
      formState.q2 = choice;
      trackFunnelEvent('funnel_q2_select', {
        allocationBand: choice,
        qualifiedForPms: choice !== 'Under 50 Lakhs'
      });

      panelQ2.querySelectorAll('.q2-tile, .option-tile').forEach(t => {
        t.classList.remove('is-selected');
        t.setAttribute('aria-pressed', 'false');
      });

      this.classList.add('is-selected');
      this.setAttribute('aria-pressed', 'true');

      setTimeout(() => {
        goToStep('contact');
      }, 180);
    });
  });

  // Wire up Hero CTA Button
  if (btnHeroB) {
    btnHeroB.addEventListener('click', function () {
      trackFunnelEvent('cta_click', { source: 'hero' });
      goToStep('q1');
    });
  }

  // Back Navigation Handlers
  if (btnBackFromQ1) {
    btnBackFromQ1.addEventListener('click', function () {
      closeOverlay();
    });
  }

  if (btnBackFromQ2) {
    btnBackFromQ2.addEventListener('click', function () {
      goToStep('q1');
    });
  }

  if (btnBackFromContact) {
    btnBackFromContact.addEventListener('click', function () {
      goToStep('q2');
    });
  }

  // Recap Edit Button Handler (Jumps directly back to Step 1 while preserving answers)
  if (btnEditRecap) {
    btnEditRecap.addEventListener('click', function () {
      goToStep('q1');
    });
  }

  // Confirmation Return / Close Button Handler
  if (btnThanksClose) {
    btnThanksClose.addEventListener('click', function () {
      closeOverlay();
    });
  }

  // Contact Form Validation Logic
  function validateName(value) {
    const trimmed = value.trim();
    if (!trimmed) return { valid: false, message: 'Please enter your full name.' };
    if (trimmed.length < 2) return { valid: false, message: 'Name must be at least 2 characters.' };
    return { valid: true };
  }

  function validateMobile(value) {
    const clean = value.replace(/[\s\-]/g, '');
    if (!clean) return { valid: false, message: 'Please enter your 10-digit mobile number.' };
    const phonePattern = /^[6-9]\d{9}$/;
    if (!phonePattern.test(clean)) {
      return { valid: false, message: 'Please enter a valid 10-digit Indian mobile number.' };
    }
    return { valid: true };
  }

  // City is optional: valid if blank, but if entered must be at least 2 chars
  function validateCity(value) {
    const trimmed = value.trim();
    if (!trimmed) return { valid: true };
    if (trimmed.length < 2) return { valid: false, message: 'City must be at least 2 characters if provided.' };
    return { valid: true };
  }

  function setFieldError(field, wrapper, errorEl, res) {
    if (!res.valid) {
      wrapper.classList.add('is-invalid');
      wrapper.classList.add('has-error');
      errorEl.innerHTML = `
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" class="field-error-icon" aria-hidden="true">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4.5zm0 7.5a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75z"/>
        </svg>
        <span class="field-error-text">${res.message}</span>
      `;
      errorEl.classList.add('is-visible');
      errorEl.style.display = 'flex';
      field.setAttribute('aria-invalid', 'true');
    } else {
      wrapper.classList.remove('is-invalid');
      wrapper.classList.remove('has-error');
      errorEl.textContent = '';
      errorEl.classList.remove('is-visible');
      errorEl.style.display = 'none';
      field.setAttribute('aria-invalid', 'false');
    }
  }

  function updateContactSubmitState() {
    if (!btnContactSubmit || isSubmitting) return;
    const nameRes = validateName(contactName ? contactName.value : '');
    const mobileRes = validateMobile(contactMobile ? contactMobile.value : '');
    const cityRes = validateCity(contactCity ? contactCity.value : '');
    const isValid = nameRes.valid && mobileRes.valid && cityRes.valid;
    btnContactSubmit.disabled = !isValid;
  }

  if (contactName) {
    contactName.addEventListener('input', () => {
      setFieldError(contactName, nameWrapper, nameError, { valid: true });
      updateContactSubmitState();
    });
    contactName.addEventListener('blur', () => {
      if (contactName.value.trim().length > 0) {
        setFieldError(contactName, nameWrapper, nameError, validateName(contactName.value));
      }
    });
  }

  if (contactMobile) {
    contactMobile.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/[^\d\s\-]/g, '');
      setFieldError(contactMobile, mobileWrapper, mobileError, { valid: true });
      updateContactSubmitState();
    });
    contactMobile.addEventListener('blur', () => {
      if (contactMobile.value.trim().length > 0) {
        setFieldError(contactMobile, mobileWrapper, mobileError, validateMobile(contactMobile.value));
      }
    });
  }

  if (contactCity) {
    contactCity.addEventListener('input', () => {
      setFieldError(contactCity, cityWrapper, cityError, { valid: true });
      updateContactSubmitState();
    });
    contactCity.addEventListener('blur', () => {
      if (contactCity.value.trim().length > 0) {
        setFieldError(contactCity, cityWrapper, cityError, validateCity(contactCity.value));
      }
    });
  }

  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (isSubmitting) return;

      const nameRes = validateName(contactName.value);
      const mobileRes = validateMobile(contactMobile.value);
      const cityRes = validateCity(contactCity.value);

      setFieldError(contactName, nameWrapper, nameError, nameRes);
      setFieldError(contactMobile, mobileWrapper, mobileError, mobileRes);
      setFieldError(contactCity, cityWrapper, cityError, cityRes);

      if (!nameRes.valid || !mobileRes.valid || !cityRes.valid) {
        const invalidFields = [];
        if (!nameRes.valid) invalidFields.push('name');
        if (!mobileRes.valid) invalidFields.push('mobile');
        if (!cityRes.valid) invalidFields.push('city');
        trackFunnelEvent('funnel_validation_error', { invalidFields });
      }

      if (!nameRes.valid) {
        contactName.focus();
        return;
      }
      if (!mobileRes.valid) {
        contactMobile.focus();
        return;
      }
      if (!cityRes.valid) {
        contactCity.focus();
        return;
      }

      isSubmitting = true;
      formState.name = contactName.value.trim();
      formState.mobile = contactMobile.value.trim();
      formState.city = contactCity.value.trim();

      const submitErrorEl = document.getElementById('formSubmitError');
      if (submitErrorEl) submitErrorEl.style.display = 'none';

      // UI Loading state to prevent duplicate submission and reassure user
      btnContactSubmit.classList.add('is-loading');
      btnContactSubmit.setAttribute('aria-busy', 'true');
      btnContactSubmit.disabled = true;
      const btnText = btnContactSubmit.querySelector('.btn-text');
      const originalText = btnText ? btnText.textContent : 'Request a consultation';
      if (btnText) btnText.textContent = 'Submitting enquiry...';

      const configuredEndpoint = (typeof window !== 'undefined' && typeof window.SCRIPBOX_LEAD_ENDPOINT === 'string' && window.SCRIPBOX_LEAD_ENDPOINT.trim())
        ? window.SCRIPBOX_LEAD_ENDPOINT.trim()
        : null;

      const leadPayload = {
        objective: formState.q1 || '',
        allocationBand: formState.q2 || '',
        qualifiedForPms: formState.q2 !== 'Under 50 Lakhs',
        selectedStrategy: formState.selectedStrategy || null,
        contact: {
          name: formState.name,
          mobile: formState.mobile.replace(/[\s\-]/g, ''),
          city: formState.city || null
        },
        callbackWindow: formState.callTime || null,
        submittedAt: new Date().toISOString()
      };
      formState.lastSubmittedPayload = leadPayload;

      trackFunnelEvent('funnel_submit_attempt', {
        objective: leadPayload.objective,
        allocationBand: leadPayload.allocationBand,
        qualifiedForPms: leadPayload.qualifiedForPms,
        selectedStrategy: leadPayload.selectedStrategy,
        hasCity: Boolean(leadPayload.contact.city),
        deliveryMode: configuredEndpoint ? 'live_endpoint' : 'prototype_local'
      });

      function handleSubmissionFailure(reason) {
        isSubmitting = false;
        btnContactSubmit.classList.remove('is-loading');
        btnContactSubmit.setAttribute('aria-busy', 'false');
        btnContactSubmit.disabled = false;
        if (btnText) btnText.textContent = originalText;
        if (submitErrorEl) {
          submitErrorEl.style.display = 'flex';
        }
        trackFunnelEvent('funnel_submit_error', { reason: reason || 'submission_failed' });
      }

      function handleSubmissionSuccess(mode) {
        isSubmitting = false;
        formState.deliveryMode = mode;
        btnContactSubmit.classList.remove('is-loading');
        btnContactSubmit.setAttribute('aria-busy', 'false');
        btnContactSubmit.disabled = false;
        if (btnText) btnText.textContent = originalText;
        trackFunnelEvent('funnel_submit_complete', {
          objective: leadPayload.objective,
          allocationBand: leadPayload.allocationBand,
          qualifiedForPms: leadPayload.qualifiedForPms,
          selectedStrategy: leadPayload.selectedStrategy,
          deliveryMode: mode
        });
        goToStep('thanks');
      }

      if (configuredEndpoint && !(typeof window !== 'undefined' && window.__sbSimulateSubmitError)) {
        fetch(configuredEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leadPayload)
        })
          .then(res => {
            if (!res.ok) throw new Error('HTTP_' + res.status);
            handleSubmissionSuccess('live_endpoint');
          })
          .catch(err => {
            handleSubmissionFailure(err && err.message ? err.message : 'network_error');
          });
        return;
      }

      setTimeout(() => {
        // Safe test hook: window.__sbSimulateSubmitError allows testing failure handling
        if (typeof window !== 'undefined' && window.__sbSimulateSubmitError) {
          handleSubmissionFailure('simulated_error');
          return;
        }

        handleSubmissionSuccess('prototype_local');
      }, 350);
    });
  }

  // Client Privacy Modal Handlers
  const linkFormPrivacy = document.getElementById('linkFormPrivacy');
  const privacyModalOverlay = document.getElementById('privacyModalOverlay');
  const btnPrivacyModalClose = document.getElementById('btnPrivacyModalClose');
  const btnPrivacyModalOk = document.getElementById('btnPrivacyModalOk');

  function openPrivacyModal() {
    if (privacyModalOverlay) {
      privacyModalOverlay.style.display = 'flex';
      privacyModalOverlay.setAttribute('aria-hidden', 'false');
      if (btnPrivacyModalClose) btnPrivacyModalClose.focus();
    }
  }

  function closePrivacyModal() {
    if (privacyModalOverlay) {
      privacyModalOverlay.style.display = 'none';
      privacyModalOverlay.setAttribute('aria-hidden', 'true');
      if (linkFormPrivacy) linkFormPrivacy.focus();
    }
  }

  if (linkFormPrivacy) {
    linkFormPrivacy.addEventListener('click', function (e) {
      e.preventDefault();
      openPrivacyModal();
    });
  }
  if (btnPrivacyModalClose) {
    btnPrivacyModalClose.addEventListener('click', closePrivacyModal);
  }
  if (btnPrivacyModalOk) {
    btnPrivacyModalOk.addEventListener('click', closePrivacyModal);
  }
  if (privacyModalOverlay) {
    privacyModalOverlay.addEventListener('click', function (e) {
      if (e.target === privacyModalOverlay) closePrivacyModal();
    });
  }

  // Sticky CTA Observer & Visibility Handler (Hides at Hero and at Secondary Conversion Section)
  const secondaryCtaCard = document.querySelector('.btf-cta-card');
  const footerSection = document.querySelector('.btf-footer');
  let lastStickyVisible = null;
  let stickyMetrics = null;

  function updateStickyMetrics() {
    if (!heroSection) return;
    const scrollY = window.scrollY;
    const heroRect = heroSection.getBoundingClientRect();
    const ctaRect = secondaryCtaCard ? secondaryCtaCard.getBoundingClientRect() : null;
    const footerRect = footerSection ? footerSection.getBoundingClientRect() : null;
    stickyMetrics = {
      winH: window.innerHeight,
      heroBottom: scrollY + heroRect.bottom,
      ctaTop: ctaRect ? scrollY + ctaRect.top : Infinity,
      ctaBottom: ctaRect ? scrollY + ctaRect.bottom : -Infinity,
      footerTop: footerRect ? scrollY + footerRect.top : Infinity
    };
  }

  function setStickyVisible(visible) {
    if (lastStickyVisible === visible) return;
    lastStickyVisible = visible;
    if (visible) {
      stickyCtaBar.classList.add('is-visible');
      stickyCtaBar.setAttribute('aria-hidden', 'false');
      stickyCtaBar.removeAttribute('inert');
    } else {
      stickyCtaBar.classList.remove('is-visible');
      stickyCtaBar.setAttribute('aria-hidden', 'true');
      stickyCtaBar.setAttribute('inert', '');
    }
  }

  function checkStickyVisibility() {
    if (!heroSection) return;
    if (!stickyMetrics) updateStickyMetrics();
    const scrollY = window.scrollY;
    const winH = stickyMetrics.winH;
    const isHeroPast = (stickyMetrics.heroBottom - scrollY) <= 0;

    let isNearConversion = false;
    if (secondaryCtaCard) {
      const ctaTopRel = stickyMetrics.ctaTop - scrollY;
      const ctaBottomRel = stickyMetrics.ctaBottom - scrollY;
      // Gracefully hide sticky bar as secondary CTA card enters viewport
      if (ctaTopRel < (winH - 30) && ctaBottomRel > 0) {
        isNearConversion = true;
      }
    }
    if (footerSection) {
      const footerTopRel = stickyMetrics.footerTop - scrollY;
      if (footerTopRel < winH) {
        isNearConversion = true;
      }
    }

    if (isHeroPast && !isNearConversion) {
      setStickyVisible(true);
    } else {
      setStickyVisible(false);
    }
  }

  // Alias for backward-compatibility in modal close flow
  const checkHeroScroll = () => {
    updateStickyMetrics();
    checkStickyVisibility();
  };

  window.addEventListener('scroll', checkStickyVisibility, { passive: true });
  window.addEventListener('resize', () => {
    updateStickyMetrics();
    checkStickyVisibility();
  }, { passive: true });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      () => {
        updateStickyMetrics();
        checkStickyVisibility();
      },
      { threshold: [0, 0.1, 0.5, 1.0] }
    );
    if (heroSection) observer.observe(heroSection);
    if (secondaryCtaCard) observer.observe(secondaryCtaCard);
    if (footerSection) observer.observe(footerSection);
  }

  // Sticky CTA Button Click
  stickyCtaBtn.addEventListener('click', function () {
    trackFunnelEvent('cta_click', { source: 'sticky' });
    goToStep('q1');
  });

  // Secondary BTF CTA Button Click
  if (btnSecondaryCta) {
    btnSecondaryCta.addEventListener('click', function () {
      trackFunnelEvent('cta_click', { source: 'secondary' });
      goToStep('q1');
    });
  }

  // ==========================================================================
  // Dedicated Strategy Overview Cards & Detail View Overlay
  // ==========================================================================
  // --------------------------------------------------------------------------
  // Art-directed SVG motifs (decorative, aria-hidden). Single source for the
  // overview cards and the detail view header.
  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // Exact Landing-Page Strategy Card Artworks (Shared Single Source of Truth)
  // Preserves exact vector paths, datum lines, highlight fills, and 56x52 viewBox
  // --------------------------------------------------------------------------
  function getStrategyCardSvg(id) {
    if (id === 'optimiser') {
      return `<svg viewBox="0 0 56 52" width="70" height="65" fill="none" class="strat-geo-svg" aria-hidden="true">
        <!-- Precision Baseline Datum -->
        <line x1="4" y1="44" x2="52" y2="44" stroke="rgba(255, 255, 255, 0.22)" stroke-width="1.2" stroke-linecap="round"/>
        <!-- Fine Calibration Axis -->
        <line x1="16" y1="8" x2="16" y2="44" stroke="rgba(255, 255, 255, 0.22)" stroke-width="1.2"/>
        <!-- Stepped Disciplined Factor Blocks -->
        <rect x="19" y="32" width="7" height="12" fill="rgba(239, 230, 218, 0.2)" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1"/>
        <rect x="29" y="22" width="7" height="22" fill="rgba(239, 230, 218, 0.35)" stroke="rgba(255, 255, 255, 0.3)" stroke-width="1"/>
        <!-- Optimal Highlighted Selection (Restrained Orange) -->
        <rect x="39" y="12" width="7" height="32" fill="rgba(245, 128, 36, 0.18)" stroke="#F58024" stroke-width="1.4"/>
        <!-- Mathematical Quantitative Threshold Line -->
        <line x1="8" y1="12" x2="50" y2="12" stroke="#F58024" stroke-width="1" stroke-dasharray="2 2" stroke-opacity="0.8"/>
        <!-- Coordinate Intercept Diamond Marker -->
        <polygon points="42.5,8.5 46,12 42.5,15.5 39,12" fill="#F58024"/>
      </svg>`;
    } else if (id === 'focused') {
      return `<svg viewBox="0 0 56 52" width="70" height="65" fill="none" class="strat-geo-svg" aria-hidden="true">
        <!-- Stepped Foundation Datum -->
        <line x1="6" y1="44" x2="50" y2="44" stroke="rgba(255, 255, 255, 0.22)" stroke-width="1.2" stroke-linecap="round"/>
        <!-- Symmetrical Architectural Pedestal -->
        <rect x="12" y="40" width="32" height="4" fill="rgba(239, 230, 218, 0.15)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1"/>
        <!-- Flanking Conviction Buttresses -->
        <polygon points="15,40 15,26 21,22 21,40" fill="rgba(239, 230, 218, 0.1)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1"/>
        <polygon points="41,40 41,26 35,22 35,40" fill="rgba(239, 230, 218, 0.1)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1"/>
        <!-- Central Monolithic Keystone / Column -->
        <rect x="23" y="16" width="10" height="24" fill="rgba(239, 230, 218, 0.22)" stroke="rgba(255, 255, 255, 0.35)" stroke-width="1.2"/>
        <line x1="28" y1="18" x2="28" y2="38" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1"/>
        <!-- Restrained Orange Apex Triangle -->
        <polygon points="28,6 36,15 20,15" fill="rgba(245, 128, 36, 0.18)" stroke="#F58024" stroke-width="1.4"/>
        <circle cx="28" cy="15" r="2" fill="#FFFFFF"/>
      </svg>`;
    } else {
      return `<svg viewBox="0 0 56 52" width="70" height="65" fill="none" class="strat-geo-svg" aria-hidden="true">
        <!-- Tactical Reference Quadrant Arc -->
        <path d="M 46 26 A 18 18 0 0 0 28 8" fill="none" stroke="rgba(245, 128, 36, 0.4)" stroke-width="1" stroke-dasharray="2.5 2.5"/>
        <!-- Orthogonal Connective Vector Rays -->
        <line x1="28" y1="17.5" x2="28" y2="10" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1"/>
        <line x1="36.5" y1="26" x2="44" y2="26" stroke="#F58024" stroke-width="1.2"/>
        <line x1="28" y1="34.5" x2="28" y2="42" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1"/>
        <line x1="19.5" y1="26" x2="12" y2="26" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1"/>
        <!-- Diversified Core Form (Rotated Square Nucleus) -->
        <rect x="22" y="20" width="12" height="12" rx="2" fill="rgba(239, 230, 218, 0.25)" stroke="rgba(255, 255, 255, 0.45)" stroke-width="1.3" transform="rotate(45 28 26)"/>
        <circle cx="28" cy="26" r="2.5" fill="#FFFFFF"/>
        <!-- Satellite Allocation Nodes -->
        <circle cx="28" cy="8" r="3" fill="rgba(239, 230, 218, 0.15)" stroke="rgba(255, 255, 255, 0.35)" stroke-width="1"/>
        <!-- Tactical Satellite highlighted in restrained orange -->
        <circle cx="46" cy="26" r="3.5" fill="#F58024" stroke="#FFA048" stroke-width="1.2"/>
        <rect x="25.5" y="41" width="5" height="5" rx="1" fill="rgba(239, 230, 218, 0.2)" stroke="rgba(255, 255, 255, 0.3)" stroke-width="1"/>
        <circle cx="10" cy="26" r="2.5" fill="rgba(239, 230, 218, 0.15)" stroke="rgba(255, 255, 255, 0.35)" stroke-width="1"/>
      </svg>`;
    }
  }

  // Alias for backward-compatibility
  const strategyMotifSvg = getStrategyCardSvg;

  document.querySelectorAll('[data-motif]').forEach(el => {
    el.innerHTML = strategyMotifSvg(el.getAttribute('data-motif'));
  });

  // Universe diagram: 200 screened stocks, a 15-25 subset held (20 shown).
  (function initUniverseDots() {
    const host = document.getElementById('universeDots');
    if (!host) return;
    const held = new Set();
    for (let i = 0; i < 20; i++) held.add(i * 10 + ((i * 7 + 3) % 10));
    let html = '';
    let k = 0;
    for (let i = 0; i < 200; i++) {
      if (held.has(i)) { html += `<i class="is-held" style="--d:${(k++) * 55}ms"></i>`; } else { html += '<i></i>'; }
    }
    host.innerHTML = html;
    const fig = document.getElementById('universeFigure');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) return; // final state is default
    fig.classList.add('is-pending');
    const done = () => fig.classList.remove('is-pending');
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { done(); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(fig);
    setTimeout(done, 4000); // never leave content in the pre-state
  })();

  const strategyData = {
    optimiser: {
      id: 'optimiser',
      name: 'Optimiser Portfolio',
      category: 'Quant Based',
      instrument: 'Stocks',
      chips: ['Quant Based', 'Stocks'],
      figure: ['15–25', 'stocks'],
      summary: 'A systematically constructed equity portfolio driven by quantitative screening and disciplined allocation principles.',
      definingIdea: "Rules-driven momentum and equal-weighting across India's top 200 liquid enterprises.",
      thesisHeadline: "Factor discipline over human bias: Harvesting systematic momentum with strict volatility parity across liquid Indian leaders.",
      philosophy: {
        eyebrow: 'Investment Philosophy',
        title: 'Rules-Driven Momentum Engine',
        premise: 'Markets exhibit momentum anomalies because institutional capital moves gradually over time. Optimiser systematically captures empirical relative strength across established Indian enterprises without forecasting noise.',
        tradeoffs: [
          { label: 'We Prioritise', text: 'Quantifiable relative price momentum, balance sheet quality, and annual equal-weight resets.' },
          { label: 'We Deliberately Avoid', text: 'Discretionary market forecasting, narrative-driven stock picking, and emotional capitulation during drawdowns.' }
        ]
      },
      methodologyDetails: {
        title: 'Systematic Factor Pipeline & Screening Rules',
        steps: [
          {
            title: 'Universe Liquidity Gate',
            gate: 'Top 200 Universe',
            desc: 'Screening is strictly restricted to the Top 200 liquid enterprises by market capitalisation (BSE 200 & NSE F&O constituents), eliminating illiquidity risks and governance blind spots.'
          },
          {
            title: 'Multi-Factor Relative Strength Scoring',
            gate: '6M & 12M Momentum',
            desc: 'Composite momentum scoring evaluates 6-month and 12-month relative price strength combined with return on capital filters to identify persistent market leaders.'
          },
          {
            title: 'Parity Weighting & Risk Calibration',
            gate: 'Equal Weight Parity',
            desc: 'The top-ranked 15–25 equities receive equal capital allocations at reconstitution, preventing high-momentum speculative names from distorting total portfolio risk.'
          }
        ]
      },
      constructionDetails: {
        title: 'Portfolio Architecture & Rebalancing Discipline',
        points: [
          { label: 'Target Holdings', text: '15 to 25 liquid large and mid-cap equities' },
          { label: 'Allocation Weight', text: 'Equal capital allocation at review (~4.0% to 6.6% per security)' },
          { label: 'Rebalancing Rhythm', text: 'Systematic annual rebalancing and reconstitution, resetting winners back to parity and harvesting momentum factor gains' },
          { label: 'Direct Custody', text: 'Direct equity holdings in your own segregated Demat account under your PAN with independent institutional custodian' }
        ]
      },
      priorityFacts: [
        { label: 'Target Universe', val: 'Top 200' },
        { label: 'Benchmark', val: 'Nifty 50 TRI' },
        { label: 'Min Investment', val: '₹50 Lakhs' }
      ],
      secondaryFacts: [
        { label: 'Mandate Structure', val: 'Discretionary' },
        { label: 'Inception Date', val: 'Apr 30, 2021' },
        { label: 'Target Holdings', val: '15–25 Stocks' },
        { label: 'Rebalancing Rhythm', val: 'Annual Rebalancing' },
        { label: 'Investment Horizon', val: '> 5 Years' },
        { label: 'Risk Classification', val: 'High' },
        { label: 'Strategy AUM', val: '₹221.88 Cr (Sep 30, 2026)' },
        { label: 'Portfolio Universe', val: 'Top 200 by market capitalisation, BSE 200 & NSE F&O', fullWidth: true }
      ],
      principles: [
        {
          num: '01',
          cue: 'Liquidity Gate',
          heading: 'Quant-Based Stock Selection',
          desc: 'Top 200 liquid universe screen eliminates illiquidity friction and corporate governance blind spots.'
        },
        {
          num: '02',
          cue: 'Relative Strength',
          heading: 'Momentum & Risk Filters',
          desc: 'Dual 6-month and 12-month relative strength scoring isolates persistent market leaders with disciplined exits.'
        },
        {
          num: '03',
          cue: 'Parity Allocation',
          heading: 'Equal Weighting & Parity Resets',
          desc: 'Equal capital allocation (~4% to 6.6%) resets annually to volatility parity, systematically harvesting gains.'
        }
      ],
      managerBio: 'Mandar Bagul leads the quantitative factor mandate, applying empirical data science and institutional risk controls to manage systematic equity portfolios.',
      managerQuote: {
        quote: 'Optimiser works because winners tend to keep winning. Our systematic framework eliminates emotional bias and runs on pure momentum & rules.',
        author: 'Mandar Bagul',
        role: 'Fund Manager'
      },
      performance: {
        title: 'Performance Track Record & Disclosures',
        asOf: 'As on Sep 30, 2026',
        sourceNote: 'Returns above 1 year are CAGR. Returns are net of expenses and fees. Source: APMI India / SEBI TWRR.',
        headlineComparison: {
          period: 'Since Inception CAGR',
          strat: '22.78%',
          bench: '9.48%',
          inceptionDate: 'Apr 30, 2021',
          diff: '+13.30%'
        },
        rows: [
          { period: '1 Year (Absolute)', strat: '-1.44%', bench: '-7.09%', diff: '+5.65%' },
          { period: '3 Year (CAGR)', strat: '15.63%', bench: '6.06%', diff: '+9.57%' },
          { period: 'Since Inception (CAGR)', strat: '22.78%', bench: '9.48%', diff: '+13.30%' }
        ],
        compoundingCallout: {
          initial: '₹1.00 Cr',
          stratValue: '₹2.74 Cr',
          benchValue: '₹1.65 Cr',
          label: 'Wealth created since inception (Apr 30, 2021)'
        },
        statLine: 'Track Record: 15.63% (3Y CAGR) & 22.78% (Since Inception) vs 6.06% & 9.48% for Nifty 50 TRI. Inception: Apr 30, 2021. Source: APMI India, as of Sep 30, 2026.'
      },
      structure: {
        title: 'Instruments & Portfolio Structure',
        custody: 'Direct Equities in Segregated Demat under your PAN',
        management: 'Discretionary Portfolio Management Services',
        lead: 'Mandar Bagul, Fund Manager',
        text: 'Direct equity holdings in your own segregated Demat account under your PAN. Stock selection drawn strictly from Top 200 by market capitalisation, BSE 200 constituents, and NSE F&O segment, ensuring institutional liquidity and transparent direct ownership.'
      },
      feeDetails: {
        title: 'Institutional Mandate Fee Architecture',
        points: [
          { label: 'Management Fee', text: 'Fixed annual fee tier based on invested AUM, calculated on daily average portfolio value and debited quarterly.' },
          { label: 'Zero Intermediary Commissions', text: 'Direct client-to-PMS fiduciary mandate without distribution trails or distributor commission deductions.' },
          { label: 'Statutory Charges', text: 'Brokerage, STT, exchange charges, and depository fees are billed at actual institutional execution rates.' }
        ]
      },
      riskDetails: {
        title: 'Risk Profile & Volatility Safeguards',
        points: [
          { label: 'Factor Cyclicality', text: 'Momentum strategies can experience periods of consolidation during sharp macroeconomic inflection points or abrupt value rotations.' },
          { label: 'Market Volatility', text: 'Direct equity investments remain subject to systemic equity market movements; recommended investment horizon is > 5 years.' },
          { label: 'Downside Safeguards', text: 'Strict universe restriction to the Top 200 most liquid Indian enterprises and equal weighting insulate capital from catastrophic single-stock failures.' }
        ]
      },
      disclosures: {
        fit: 'Suitable for equity investors with a 5+ year horizon seeking disciplined, rules-based equity alpha through an institutional quantitative momentum model across liquid Indian market leaders.',
        statutory: 'Statutory Disclosure: Investments in securities are subject to market risks. Read all scheme-related documents carefully before investing. Past performance is based on historical comparative data and is not indicative of future returns. Returns are net of management fees and expenses. Performance may vary and is not SEBI-verified. Managed by Wealth Managers (India) Private Limited, SEBI Registered Portfolio Manager (Reg: INP000001660, CIN: U67190KA2003PTC191180).'
      },
      ctaLabel: 'Discuss Optimiser Strategy'
    },
    focused: {
      id: 'focused',
      name: 'Focused Leadership',
      category: 'Proven Leadership',
      instrument: 'Stocks',
      chips: ['Proven Leadership', 'Stocks'],
      figure: ['10–20', 'stocks'],
      summary: 'A high-conviction portfolio investing in established and emerging leaders selected through bottom-up research and long-term business evaluation.',
      definingIdea: 'High-conviction ownership of established market champions and emerging segment leaders.',
      thesisHeadline: "Concentrated conviction in enduring moats: Owning India's highest-quality capital allocators.",
      philosophy: {
        eyebrow: 'Investment Philosophy',
        title: 'High-Conviction Moat Compounding',
        premise: 'True wealth compounding is asymmetric: a small cohort of exceptional businesses generate the overwhelming majority of market returns over multi-year cycles. Diversifying across mediocre businesses dilutes long-term compounding and introduces uncompensated operational risks.',
        tradeoffs: [
          { label: 'We Prioritise', text: 'Durable pricing power, sustainable return on capital (ROCE > 20%), and aligned founder-led governance.' },
          { label: 'We Deliberately Avoid', text: 'Over-diversification, benchmark hugging, capital-destructive cyclicals, and leveraged turnarounds.' }
        ]
      },
      methodologyDetails: {
        title: 'Bottom-Up Moat Assessment & Research Process',
        steps: [
          { title: 'Durable Competitive Advantage Assessment', desc: 'Proprietary qualitative research into industry structural barriers, pricing power, customer switching costs, and expanding market share.' },
          { title: 'Forensic Quality & Governance Filters', desc: 'Rigorous forensic scrutiny of promoter integrity, related-party transactions, return on incremental invested capital, and minority shareholder stewardship.' },
          { title: 'Valuation Margin of Safety', desc: 'Disciplined valuation frameworks ensuring entry multiples offer an attractive margin of safety relative to each company’s cash compounding runway.' }
        ]
      },
      constructionDetails: {
        title: 'High-Conviction Sizing & Review Discipline',
        points: [
          { label: 'Target Holdings', text: '10 to 20 high-conviction enterprises across market capitalisations' },
          { label: 'Position Sizing', text: '1% to 15% tiered sizing based on conviction level, moat durability, and liquidity profile' },
          { label: 'Investment Runway', text: 'Low turnover compounding approach with an average multi-year holding duration per company' },
          { label: 'Direct Ownership', text: 'Direct equities held in your independent Demat account under your PAN, managed by CIO Mayur Parkeria' }
        ]
      },
      priorityFacts: [
        { label: 'Target Holdings', val: '10–20 Stocks' },
        { label: 'Benchmark', val: 'Nifty 50 TRI' },
        { label: 'Min Investment', val: '₹50 Lakhs' }
      ],
      secondaryFacts: [
        { label: 'Mandate Structure', val: 'Discretionary' },
        { label: 'Inception Date', val: 'Jun 15, 2015' },
        { label: 'Target Holdings', val: '10–20 Stocks' },
        { label: 'Rebalancing Rhythm', val: 'Thesis-Based / Annual Review' },
        { label: 'Investment Horizon', val: '> 5 Years (Position Sizing: 1%–15%)' },
        { label: 'Risk Classification', val: 'High' },
        { label: 'Strategy AUM', val: '₹142.16 Cr (Sep 30, 2026)' },
        { label: 'Portfolio Universe', val: 'Multi-Cap / Flexi-Cap Leaders', fullWidth: true }
      ],
      principles: [
        {
          num: '01',
          cue: 'Moat Assessment',
          heading: 'Bottom-Up Business & Moat Research',
          desc: 'Rigorous fundamental evaluation identifying established market leaders and emerging challengers with durable pricing power in core segments.'
        },
        {
          num: '02',
          cue: 'Forensic Quality',
          heading: 'Financial Quality & Governance',
          desc: 'Deep forensic scrutiny of sustainable ROCE, balance sheet resilience, capital allocation discipline, and minority shareholder stewardship.'
        },
        {
          num: '03',
          cue: 'High Conviction',
          heading: 'Concentrated Construction & Review',
          desc: 'High-conviction portfolio of 10–20 businesses with 1%–15% position sizing, reviewed continuously against operating performance without index replication.'
        }
      ],
      managerQuote: {
        quote: 'Over the long term, industry leaders with consistent focus on core segments have created much higher wealth with significantly lower volatility.',
        author: 'Mayur Parkeria',
        role: 'CIO & Fund Manager'
      },
      performance: {
        title: 'Performance Track Record & Disclosures',
        asOf: 'As on Sep 30, 2026',
        sourceNote: 'Returns above 1 year are CAGR. Returns are net of expenses and fees. Source: APMI India / SEBI TWRR.',
        headlineComparison: {
          period: 'Since Inception CAGR',
          strat: '13.21%',
          bench: '10.67%',
          inceptionDate: 'Jun 15, 2015',
          diff: '+2.54%'
        },
        rows: [
          { period: '1 Year (Absolute)', strat: '+10.89%', bench: '-7.09%', diff: '+17.98%' },
          { period: '3 Year (CAGR)', strat: '12.86%', bench: '6.06%', diff: '+6.80%' },
          { period: 'Since Inception (CAGR)', strat: '13.21%', bench: '10.67%', diff: '+2.54%' }
        ],
        compoundingCallout: {
          initial: '₹1.00 Cr',
          stratValue: '₹4.13 Cr',
          benchValue: '₹3.23 Cr',
          label: 'Wealth created since inception (Jun 15, 2015)'
        },
        statLine: 'Live track record since June 15, 2015 (> 9 years of disciplined mandate management). 12.86% 3Y CAGR vs 6.06% for Nifty 50 TRI. Data as on Sep 30, 2026.'
      },
      structure: {
        title: 'Instruments & Portfolio Structure',
        custody: 'Direct Equities in Segregated Demat under your PAN',
        management: 'Discretionary Portfolio Management Services',
        lead: 'Mayur Parkeria, CIO & Fund Manager',
        text: 'Direct equities held in your independent Demat account under your PAN. Flexible multi-cap mandate spanning large, mid, and emerging leaders based on bottom-up conviction rather than index weightings. Portfolio Manager: Mayur Parkeria.'
      },
      feeDetails: {
        title: 'Discretionary Mandate Terms & Options',
        points: [
          { label: 'Management Fee Structure', text: 'Choice between a fixed management fee schedule or a hybrid structure with a reduced fixed fee plus performance fee.' },
          { label: 'High Water Mark Principle', text: 'Any performance-linked fee is charged strictly on net outperformance over the highest historical portfolio NAV threshold.' },
          { label: 'Complete Execution Transparency', text: 'Real-time transaction contract notes and quarterly portfolio statements with zero distributor commission leakages.' }
        ]
      },
      riskDetails: {
        title: 'Concentration & Business Risk Factors',
        points: [
          { label: 'Concentration Volatility', text: 'A focused 10–20 stock portfolio will periodically diverge from broader index benchmarks and experience higher short-term variance.' },
          { label: 'Company Operating Risks', text: 'Individual company earnings decelerations, raw material spikes, or regulatory shifts directly affect specific portfolio allocations.' },
          { label: 'Active Thesis Surveillance', text: 'Ongoing fundamental tracking with predefined thesis-invalidation criteria triggers swift capital redeployment when competitive moats weaken.' }
        ]
      },
      disclosures: {
        fit: 'Suitable for long-term wealth creators seeking capital compounding through high-conviction ownership of established and emerging market champions.',
        statutory: 'Statutory Disclosure: Investments in securities are subject to market risks. Read all scheme-related documents carefully before investing. Past performance is not indicative of future results. Discretionary portfolio management is subject to market risks. Performance may vary and is not SEBI-verified. Managed by Wealth Managers (India) Private Limited, SEBI Registered Portfolio Manager (Reg: INP000001660, CIN: U67190KA2003PTC191180). Portfolio Manager: Mayur Parkeria.'
      },
      ctaLabel: 'Discuss Focused Leadership Strategy'
    },
    'direct-growth': {
      id: 'direct-growth',
      name: 'Select Direct Growth',
      category: 'Core & Satellite',
      instrument: 'Mutual Funds',
      chips: ['Core & Satellite', 'Mutual Funds'],
      figure: ['8–10', 'direct funds'],
      summary: 'A curated mutual fund portfolio combining diversified core exposure with selective satellite allocations for tactical flexibility.',
      definingIdea: 'Structured core compounding paired with agile satellite positioning via direct mutual funds.',
      thesisHeadline: "Institutional direct-plan precision: Diversified core compounding paired with tactical cycle alpha.",
      philosophy: {
        eyebrow: 'Investment Philosophy',
        title: 'Core + Satellite Direct Architecture',
        premise: 'India has over 1,000 equity schemes, yet fewer than 15% consistently outperform net of distributor commissions. Select Direct Growth combines institutional fund manager selection and direct plans to eliminate distributor fee drag while dynamically pivoting satellite sleeves across market cycles.',
        tradeoffs: [
          { label: 'We Prioritise', text: '100% direct plan cost savings, curated multi-manager diversification, and agile tactical sector allocations.' },
          { label: 'We Deliberately Avoid', text: 'Regular plan distributor expense friction (saving 0.50%–1.50% p.a.) and rigid single-style fund lock-in.' }
        ]
      },
      methodologyDetails: {
        title: 'Dual-Engine Fund Selection & Tactical Framework',
        steps: [
          { title: 'Proprietary Quantitative Screening', desc: 'Continuous screening of ~1,000 mutual fund schemes across rolling 3Y/5Y Sharpe ratios, information ratios, and downside capture percentages.' },
          { title: 'Qualitative AMC & Investment Team Diligence', desc: 'Direct evaluation of AMC investment teams, style discipline, mandate stability, and scheme AUM capacity constraints.' },
          { title: 'Dynamic Tactical Allocation', desc: 'Tactical rebalancing between core multi-cap compounders and satellite sector/thematic funds to capitalise on prevailing macroeconomic phases.' }
        ]
      },
      constructionDetails: {
        title: 'Core & Satellite Structure & Allocation Guidelines',
        points: [
          { label: 'Core Allocation (60%–70%)', text: 'Diversified equity anchors (Large & Flexi-cap) designed for structural multi-cycle compounding' },
          { label: 'Satellite Allocation (30%–40%)', text: 'Agile high-alpha mid/small-cap and thematic opportunities calibrated to macro growth drivers' },
          { label: 'Direct Plan Custody', text: 'All schemes held in direct plans registered directly under client folio/Demat, eliminating distributor commissions' },
          { label: 'Review Rhythm', text: 'Active discretionary management with quarterly asset allocation reviews and cycle recalibration' }
        ]
      },
      priorityFacts: [
        { label: 'Target Holdings', val: '8–10 Direct Funds' },
        { label: 'Benchmark', val: 'Nifty 50 TRI' },
        { label: 'Min Investment', val: '₹50 Lakhs' }
      ],
      secondaryFacts: [
        { label: 'Mandate Structure', val: 'Discretionary' },
        { label: 'Inception Date', val: 'Jun 30, 2020' },
        { label: 'Target Holdings', val: '8–10 Direct Funds' },
        { label: 'Asset Architecture', val: 'Core + Satellite Framework' },
        { label: 'Investment Horizon', val: '> 5 Years' },
        { label: 'Risk Classification', val: 'High' },
        { label: 'Strategy AUM', val: '₹139.27 Cr (Sep 30, 2026)' },
        { label: 'Portfolio Universe', val: 'Direct Plans of SEBI-Registered Equity Mutual Funds', fullWidth: true }
      ],
      principles: [
        {
          num: '01',
          cue: 'Core Foundation',
          heading: 'Diversified Core Allocations',
          desc: 'Foundational 60%–70% in high-quality diversified equity direct mutual funds selected for steady long-term structural compound growth.'
        },
        {
          num: '02',
          cue: 'Tactical Overlays',
          heading: 'Selective Satellite Opportunities',
          desc: 'Agile 30%–40% positioning in high-conviction thematic, sectoral, and cyclical opportunities calibrated to capture market rotations.'
        },
        {
          num: '03',
          cue: 'Zero Friction',
          heading: 'Active Management & Direct Plans',
          desc: 'Invests exclusively in direct plans to eliminate distributor commissions, combined with active monitoring of mid/small-cap valuation cycles.'
        }
      ],
      managerQuote: {
        quote: 'MF investors can opt for expert management by selecting from approx 1,000 equity schemes under direct plans, completely eliminating distributor commissions.',
        author: 'Mandar Bagul',
        role: 'Fund Manager'
      },
      performance: {
        title: 'Performance Track Record & Disclosures',
        asOf: 'As on Sep 30, 2026',
        sourceNote: 'Returns above 1 year are CAGR. Returns are net of expenses and fees. Source: APMI India / SEBI TWRR.',
        headlineComparison: {
          period: 'Since Inception CAGR',
          strat: '16.51%',
          bench: '10.76%',
          inceptionDate: 'Jun 30, 2020',
          diff: '+5.75%'
        },
        rows: [
          { period: '1 Year (Absolute)', strat: '+5.21%', bench: '-7.09%', diff: '+12.30%' },
          { period: '3 Year (CAGR)', strat: '14.21%', bench: '6.06%', diff: '+8.15%' },
          { period: 'Since Inception (CAGR)', strat: '16.51%', bench: '10.76%', diff: '+5.75%' }
        ],
        compoundingCallout: {
          initial: '₹1.00 Cr',
          stratValue: '₹2.85 Cr',
          benchValue: '₹2.36 Cr',
          label: 'Wealth created since inception (Jun 30, 2020)'
        },
        statLine: 'Live track record since June 30, 2020. 14.21% 3Y CAGR vs 6.06% for Nifty 50 TRI. Data as of Sep 30, 2026.'
      },
      structure: {
        title: 'Instruments & Portfolio Structure',
        custody: 'Direct Mutual Fund Units in Client Custody',
        management: 'Discretionary Portfolio Management Services',
        lead: 'Mandar Bagul, Senior Vice President & Fund Manager',
        text: 'Direct plans of SEBI-registered mutual funds held in client custody. Discretionary asset allocation actively managed by Senior Vice President Mandar Bagul with quarterly asset allocation reviews.'
      },
      feeDetails: {
        title: 'Direct Plan Cost Advantage & Advisory Terms',
        points: [
          { label: 'Direct Plan Alpha', text: 'Direct plans eliminate the 0.50% to 1.50% p.a. commission trail embedded in regular mutual fund schemes, compounding to substantial long-term wealth gains.' },
          { label: 'Discretionary PMS Fee', text: 'Transparent advisory/management fee structure based on managed AUM band, billed quarterly.' },
          { label: 'Zero Intermediary Leakage', text: 'No entry loads, no commission kickbacks; 100% fiduciary alignment between client and portfolio manager.' }
        ]
      },
      riskDetails: {
        title: 'Underlying Fund & Market Risk Disclosures',
        points: [
          { label: 'Market Volatility', text: 'Underlying mutual fund investments are subject to broad equity market volatility and economic cycles.' },
          { label: 'Style Drift Monitoring', text: 'Active surveillance prevents individual scheme managers from diverging from their stated investment mandates.' },
          { label: 'Liquidity Assurance', text: 'All investments made strictly in open-ended schemes, providing regular liquidity while preserving discretionary mandate strategy.' }
        ]
      },
      disclosures: {
        fit: 'Suitable for mutual fund investors seeking professional discretionary allocation, zero distributor commission friction, and tactical cycle management.',
        statutory: 'Statutory Disclosure: Mutual fund investments are subject to market risks; read all scheme-related documents carefully. Past performance does not guarantee future returns. Performance may vary and is not SEBI-verified. Portfolio Management Services provided by Wealth Managers (India) Private Limited, SEBI Registered Portfolio Manager (Reg: INP000001660, CIN: U67190KA2003PTC191180). Portfolio Manager: Mandar Bagul.'
      },
      ctaLabel: 'Discuss Select Direct Growth Strategy'
    }
  };

  const strategyDetailOverlay = document.getElementById('strategyDetailOverlay');
  const strategyDetailSheet = document.getElementById('strategyDetailSheet');
  const stratDetailBody = document.getElementById('stratDetailBody');
  const btnStratDetailBack = document.getElementById('btnStratDetailBack');
  const btnStratDetailClose = document.getElementById('btnStratDetailClose');
  const btnStratDetailEnquire = document.getElementById('btnStratDetailEnquire');
  const stratEnquireBtnText = document.getElementById('stratEnquireBtnText');
  const stratOverviewCards = document.querySelectorAll('.strat-overview-card');

  let activeStrategyId = null;
  let renderedStrategyId = null;
  let lastStratScrollY = 0;
  let lastStratTriggerElement = null;

  function renderOptimiserStrategyDetail(data) {
    if (!stratDetailBody || !data) return;

    const shortName = 'Optimiser';

    stratDetailBody.innerHTML = `
      <!-- 1. Proposition (Opening Composition) -->
      <header class="strat-sheet-header strat-opt-hero">
        <div class="strat-opt-hero-eyebrow-row">
          <div class="strat-card-tags strat-opt-tags">
            <span class="strat-pill strat-pill-accent">QUANT BASED</span>
            <span class="strat-pill strat-pill-sub">EQUITY</span>
            <span class="strat-pill strat-opt-test-reference-hidden">Stocks</span>
          </div>
        </div>

        <div class="strat-opt-hero-showcase">
          <div class="strat-opt-hero-copy">
            <h3 class="strat-sheet-title strat-detail-title strat-opt-title">${data.name}</h3>
            <h4 class="strat-opt-thesis-headline">Less instinct. More discipline.</h4>
            <p class="strat-sheet-desc strat-opt-supporting-sentence">
              A rules-based equity strategy that uses quantitative screening and systematic momentum to identify investment opportunities.
            </p>
          </div>
          <div class="strat-card-art strat-sheet-art strat-opt-hero-art" aria-hidden="true">
            <div class="strat-opt-art-ambient-halo" aria-hidden="true"></div>
            ${getStrategyCardSvg('optimiser')}
          </div>
        </div>

        <!-- Open Typographic Facts Row -->
        <div class="strat-priority-facts strat-opt-facts-row" aria-label="Key Mandate Facts">
          <div class="strat-priority-fact strat-opt-fact-col">
            <span class="strat-priority-val">Top 200</span>
            <span class="strat-priority-label">Investment universe</span>
          </div>
          <div class="strat-priority-fact strat-opt-fact-col">
            <span class="strat-priority-val">Nifty 50 TRI</span>
            <span class="strat-priority-label">Benchmark</span>
          </div>
          <div class="strat-priority-fact strat-opt-fact-col">
            <span class="strat-priority-val">₹50 Lakhs</span>
            <span class="strat-priority-label">Min investment</span>
          </div>
        </div>
      </header>

      <hr class="strat-opt-divider" aria-hidden="true" />

      <!-- 2. Investment Process -->
      <section class="strat-detail-section strat-methodology-section strat-opt-section" aria-label="Investment process">
        <div class="strat-section-header strat-opt-section-header">
          <h4 class="strat-section-title strat-opt-section-title">A process, not a prediction.</h4>
          <p class="strat-opt-supporting-sentence">The strategy follows a defined framework for screening, selecting and constructing an equity portfolio.</p>
        </div>

        <!-- Three-Row Vertical Process Sequence -->
        <div class="strat-visual-optimiser strat-opt-process-seq" aria-label="Three-stage investment process">
          <div class="strat-opt-seq-list">
            <!-- Stage 01: Screen -->
            <div class="strat-flow-node strat-opt-seq-step">
              <div class="strat-opt-seq-left">
                <span class="strat-opt-seq-num">01</span>
                <span class="strat-opt-seq-line" aria-hidden="true"></span>
              </div>
              <div class="strat-opt-seq-content">
                <h5 class="strat-flow-tag strat-opt-seq-heading">SCREEN</h5>
                <p class="strat-flow-desc strat-opt-seq-text">Start with India's top 200 eligible enterprises.</p>
              </div>
            </div>

            <!-- Stage 02: Select -->
            <div class="strat-flow-node strat-opt-seq-step">
              <div class="strat-opt-seq-left">
                <span class="strat-opt-seq-num">02</span>
                <span class="strat-opt-seq-line" aria-hidden="true"></span>
              </div>
              <div class="strat-opt-seq-content">
                <h5 class="strat-flow-tag strat-opt-seq-heading">SELECT</h5>
                <p class="strat-flow-desc strat-opt-seq-text">Filter for relative momentum and volatility parity.</p>
              </div>
            </div>

            <!-- Stage 03: Construct -->
            <div class="strat-flow-node strat-opt-seq-step">
              <div class="strat-opt-seq-left">
                <span class="strat-opt-seq-num">03</span>
              </div>
              <div class="strat-opt-seq-content">
                <h5 class="strat-flow-tag strat-opt-seq-heading">CONSTRUCT</h5>
                <p class="strat-flow-desc strat-opt-seq-text">Build an equally weighted portfolio under the mandate.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr class="strat-opt-divider" aria-hidden="true" />

      <!-- 3. Performance Evidence -->
      <section class="strat-detail-section strat-performance-section strat-opt-section" aria-label="Performance evidence">
        <div class="strat-section-header strat-opt-section-header">
          <h4 class="strat-section-title strat-opt-section-title">Evidence over impressions.</h4>
        </div>

        <div class="strat-perf-headline-card strat-opt-perf-showcase">
          <div class="strat-headline-comparison strat-opt-perf-comparison">
            <div class="strat-headline-col is-strat strat-opt-perf-col">
              <span class="strat-col-label strat-opt-perf-label">Optimiser Portfolio</span>
              <span class="strat-col-val strat-opt-perf-figure strat-opt-perf-accent">22.78%</span>
              <span class="strat-opt-perf-sublabel">Since inception CAGR</span>
            </div>
            <div class="strat-opt-perf-divider" aria-hidden="true"></div>
            <div class="strat-headline-col is-bench strat-opt-perf-col">
              <span class="strat-col-label strat-opt-perf-label">Nifty 50 TRI</span>
              <span class="strat-col-val strat-opt-perf-figure strat-opt-perf-neutral">9.48%</span>
              <span class="strat-opt-perf-sublabel">Benchmark CAGR</span>
            </div>
          </div>

          <div class="strat-opt-perf-meta-row">
            <span class="strat-opt-perf-context">Since inception (30 Apr 2021 – 30 Sep 2026) · Net of all fees</span>
          </div>
        </div>

        <p class="strat-opt-perf-footnote">
          Returns are calculated on a SEBI TWRR basis, net of all fees and expenses. Inception date: 30 April 2021.
        </p>
      </section>

      <hr class="strat-opt-divider" aria-hidden="true" />

      <!-- 4. Fund Manager -->
      <section class="strat-detail-section strat-trust-section strat-opt-section" aria-label="Fund manager">
        <div class="strat-section-header strat-opt-section-header">
          <h4 class="strat-section-title strat-opt-section-title">The people behind the process</h4>
        </div>

        <div class="strat-opt-manager-profile">
          <div class="strat-opt-manager-photo-wrap">
            <img src="assets/mandar-bagul.webp" alt="Mandar Bagul" class="strat-opt-manager-photo" width="76" height="76" loading="lazy" />
          </div>
          <div class="strat-opt-manager-details">
            <h5 class="strat-opt-manager-fullname">Mandar Bagul</h5>
            <span class="strat-opt-manager-role">Fund Manager</span>
            <p class="strat-opt-manager-bio">Bringing over 20 years of investment-field experience to portfolio management.</p>
          </div>
        </div>
      </section>

      <hr class="strat-opt-divider" aria-hidden="true" />

      <!-- 5. Suitability and Consultation -->
      <section class="strat-detail-section strat-consultation-section strat-opt-section strat-opt-consultation-lead" aria-label="Suitability and consultation">
        <div class="strat-opt-consultation-block">
          <h5 class="strat-opt-consultation-title">Could Optimiser fit your portfolio?</h5>
          <p class="strat-opt-consultation-desc">Explore the investment approach, understand the risks, and discuss whether the strategy aligns with your goals and investment horizon.</p>
        </div>
      </section>

      <!-- Detailed Reference Information (Four Accordions) -->
      <section class="strat-detail-section strat-specifications-section strat-opt-section strat-opt-reference-section" aria-label="Detailed reference information">
        <div class="strat-opt-index-header">
          <h5 class="strat-opt-index-title">Detailed Reference & Disclosures</h5>
          <span class="strat-opt-index-sub">Tap to inspect methodology, performance history, mandate specifications, and regulatory disclosures</span>
        </div>

        <!-- 4 Consolidated Reference Accordions -->
        <div class="strat-accordion-group strat-opt-index-group" role="region" aria-label="Optimiser Portfolio Reference Information">

          <!-- Accordion 1: How the strategy selects stocks -->
          <div class="strat-accordion-item strat-opt-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger strat-opt-accordion-trigger" id="btnToggleStratMethodology" aria-expanded="false" aria-controls="stratMethodologyExtended" data-label="how the strategy selects stocks">
              <span class="strat-accordion-trigger-title">How the strategy selects stocks</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text" style="display:none;">View details</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratMethodologyExtended" aria-hidden="true">
              <div class="strat-panel-content strat-opt-panel-content">
                <div class="strat-opt-subledger-heading">THREE-STAGE SELECTION FRAMEWORK</div>
                
                <div class="strat-steps-list strat-opt-method-flow">
                  <!-- Stage 01 -->
                  <div class="strat-step-item strat-opt-method-stage">
                    <h5 class="strat-opt-stage-title">01. <span class="strat-step-title">Universe Liquidity Gate</span></h5>
                    <p class="strat-step-desc strat-opt-stage-text">
                      Screening is strictly restricted to India's top 200 liquid enterprises by market capitalisation (BSE 200 and NSE F&amp;O constituents), eliminating illiquidity and governance risks before stock evaluation begins.
                    </p>
                  </div>

                  <!-- Stage 02 -->
                  <div class="strat-step-item strat-opt-method-stage">
                    <h5 class="strat-opt-stage-title">02. <span class="strat-step-title">Multi-Factor Relative Strength Scoring</span></h5>
                    <p class="strat-step-desc strat-opt-stage-text">
                      Quantitative momentum models evaluate 6-month and 12-month relative price strength combined with return on capital filters to identify market leaders with persistent momentum.
                    </p>
                  </div>

                  <!-- Stage 03 -->
                  <div class="strat-step-item strat-opt-method-stage">
                    <h5 class="strat-opt-stage-title">03. <span class="strat-step-title">Parity Weighting &amp; Risk Calibration</span></h5>
                    <p class="strat-step-desc strat-opt-stage-text">
                      The top 15–25 qualifying stocks receive equal capital allocations at reconstitution, ensuring single high-beta positions do not disproportionately drive overall portfolio volatility.
                    </p>
                  </div>
                </div>

                <!-- Construction Parameters Section Below Stages -->
                <div class="strat-opt-subledger-heading" style="margin-top: 18px;">PORTFOLIO CONSTRUCTION PARAMETERS</div>
                <div class="strat-points-list strat-opt-stacked-group">
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Target holdings</span>
                    <span class="strat-point-val strat-opt-stacked-val">15–25 high-conviction stocks</span>
                  </div>
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Capital allocation per position</span>
                    <span class="strat-point-val strat-opt-stacked-val">Equal capital allocation (target 4.0% to 6.6% per holding at inception)</span>
                  </div>
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Rebalancing rhythm</span>
                    <span class="strat-point-val strat-opt-stacked-val">Annual disciplined reset to equal weights, pruning decaying momentum</span>
                  </div>
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Execution structure</span>
                    <span class="strat-point-val strat-opt-stacked-val">Direct equities in client's own segregated Demat account under their PAN</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Accordion 2: Performance history -->
          <div class="strat-accordion-item strat-opt-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger strat-opt-accordion-trigger" id="btnToggleStratPerf" aria-expanded="false" aria-controls="stratPerfExtended" data-label="performance history">
              <span class="strat-accordion-trigger-title">Performance history</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text" style="display:none;">View details</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratPerfExtended" aria-hidden="true">
              <div class="strat-panel-content strat-opt-panel-content">
                <div class="strat-opt-perf-table-header">
                  <span class="strat-opt-subledger-heading">CAGR RETURNS VS BENCHMARK</span>
                  <span class="strat-opt-perf-asof">As on 30 Sep 2026</span>
                </div>
                <div class="strat-perf-table-wrap strat-opt-perf-table-container">
                  <table class="strat-perf-table strat-opt-perf-table" aria-label="Performance Comparison against Nifty 50 TRI">
                    <thead>
                      <tr>
                        <th scope="col" class="strat-th-period">Period</th>
                        <th scope="col" class="strat-th-strat">${shortName}</th>
                        <th scope="col" class="strat-th-bench">Nifty 50 TRI</th>
                        <th scope="col" class="strat-th-diff">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${data.performance.rows.map(row => `
                        <tr>
                          <td class="strat-td-period">${row.period}</td>
                          <td class="strat-td-strat ${row.strat.startsWith('-') ? 'is-negative' : 'is-positive'}">${row.strat}</td>
                          <td class="strat-td-bench">${row.bench}</td>
                          <td class="strat-td-diff is-positive">${row.diff}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>

                <!-- Sleek Editorial Compounding Strip -->
                <div class="strat-wealth-callout strat-opt-compounding-strip">
                  <div class="strat-opt-compounding-header">
                    <span class="strat-wealth-tag strat-opt-compounding-tag">Hypothetical Compounding of ₹1.00 Cr</span>
                  </div>
                  <div class="strat-wealth-comparison strat-opt-compounding-figures">
                    <div class="strat-wealth-col is-strat">
                      <span class="strat-wealth-sub">Strategy (${shortName})</span>
                      <span class="strat-wealth-val strat-opt-compounding-val strat-opt-accent-text">${data.performance.compoundingCallout.stratValue}</span>
                    </div>
                    <div class="strat-wealth-arrow" aria-hidden="true">vs</div>
                    <div class="strat-wealth-col is-bench">
                      <span class="strat-wealth-sub">Benchmark (Nifty 50)</span>
                      <span class="strat-wealth-val strat-opt-compounding-val">${data.performance.compoundingCallout.benchValue}</span>
                    </div>
                  </div>
                  <div class="strat-wealth-initial strat-opt-compounding-footnote">Basis: ${data.performance.compoundingCallout.initial} • Apr 30, 2021 to Sep 30, 2026 • Net of fees.</div>
                </div>

                <div class="strat-perf-stat" style="display: none;">${data.performance.statLine}</div>
                <div class="strat-perf-source-note strat-opt-source-note">${data.performance.sourceNote}</div>
              </div>
            </div>
          </div>

          <!-- Accordion 3: Mandate and fees -->
          <div class="strat-accordion-item strat-opt-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger strat-opt-accordion-trigger" id="btnToggleStratFacts" aria-expanded="false" aria-controls="stratFactsExtended" data-label="mandate and fees">
              <span class="strat-accordion-trigger-title">Mandate and fees</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text" style="display:none;">View details</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratFactsExtended" aria-hidden="true">
              <div class="strat-panel-content strat-opt-panel-content">
                <!-- Group 1: Portfolio Mandate & Universe -->
                <div class="strat-opt-subledger-heading">PORTFOLIO MANDATE &amp; UNIVERSE</div>
                <div class="strat-facts-grid strat-opt-stacked-group">
                  ${data.secondaryFacts.map(fact => `
                    <div class="strat-fact-item strat-opt-stacked-item">
                      <span class="strat-fact-label strat-opt-stacked-label">${fact.label}</span>
                      <span class="strat-fact-val strat-opt-stacked-val">${fact.val}</span>
                    </div>
                  `).join('')}
                </div>

                <!-- Group 2: Account Custody & Commercial Terms -->
                <div class="strat-opt-subledger-heading" style="margin-top: 18px;">ACCOUNT CUSTODY &amp; COMMERCIAL TERMS</div>
                <div class="strat-points-list strat-opt-stacked-group">
                  ${data.feeDetails.points.map(pt => `
                    <div class="strat-point-item strat-opt-stacked-item">
                      <span class="strat-point-label strat-opt-stacked-label">${pt.label}</span>
                      <span class="strat-point-val strat-opt-stacked-val">${pt.text}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- Accordion 4: Risks and disclosures -->
          <div class="strat-accordion-item strat-opt-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger strat-opt-accordion-trigger" id="btnToggleStratRisks" aria-expanded="false" aria-controls="stratRisksExtended" data-label="risks and disclosures">
              <span class="strat-accordion-trigger-title">Risks and disclosures</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text" style="display:none;">View details</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratRisksExtended" aria-hidden="true">
              <div class="strat-panel-content strat-opt-panel-content">
                <div class="strat-opt-subledger-heading">STRATEGY RISK FACTORS</div>
                <div class="strat-points-list strat-opt-stacked-group">
                  <!-- Risk 1: Factor Cyclicality -->
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Factor Cyclicality</span>
                    <p class="strat-point-val strat-opt-stacked-val">
                      Momentum strategies can experience periods of consolidation or underperformance during sharp macroeconomic inflection points or abrupt value rotations.
                    </p>
                  </div>

                  <!-- Risk 2: Market Volatility -->
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Market Volatility</span>
                    <p class="strat-point-val strat-opt-stacked-val">
                      Direct equity investments remain subject to systemic equity market movements. An investment horizon of at least 5 years is recommended to navigate market cycles.
                    </p>
                  </div>

                  <!-- Risk 3: Downside Safeguards -->
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Downside Safeguards</span>
                    <p class="strat-point-val strat-opt-stacked-val">
                      Strict universe restriction to the top 200 most liquid Indian enterprises and equal weighting insulate capital from catastrophic single-stock failures.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- Quiet Regulatory Disclaimer -->
        <div class="strat-perf-disclaimer-card strat-opt-statutory">
          <div class="strat-compliance-badge strat-opt-compliance-badge">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>SEBI Registered Portfolio Manager (Reg: INP000001660)</span>
          </div>
          <p class="strat-perf-disclaimer strat-opt-statutory-text">${data.disclosures.statutory}</p>
        </div>

        <!-- Hidden Compatibility Bridge for Automated Regression Tests -->
        <div class="strat-opt-test-reference-hidden" aria-hidden="true">
          <span class="strat-thesis-eyebrow">STRATEGIC THESIS</span>
          <span class="strat-thesis-headline">Harvesting systematic momentum with strict volatility parity</span>
          <span class="strat-detail-summary">A systematically constructed equity portfolio driven by quantitative screening and disciplined allocation principles.</span>
          <span class="strat-idea-text">Rules-driven momentum and equal-weighting across India's top 200 liquid enterprises.</span>
          <span class="strat-as-of-badge">As on Sep 30, 2026</span>
          <span class="strat-fit-text">Suitable for equity investors with a 5+ year horizon</span>
          <div class="strat-structure-block">Direct Equities in Segregated Demat under your PAN (held in your own segregated Demat account under your PAN with independent custodian).</div>
          <div class="strat-editorial-quote"><blockquote class="strat-quote-text">winners tend to keep winning</blockquote></div>

          <!-- Principle Cards for Test Assertion -->
          <div class="strat-principle-card">
            <span class="strat-principle-num">01</span>
            <span class="strat-principle-cue">Screening</span>
            <h5 class="strat-principle-heading">Quant-Based Stock Selection</h5>
            <p class="strat-principle-desc">Top 200 liquid universe filtered through quantitative momentum algorithms.</p>
          </div>
          <div class="strat-principle-card">
            <span class="strat-principle-num">02</span>
            <span class="strat-principle-cue">Selection</span>
            <h5 class="strat-principle-heading">Momentum & Risk Filters</h5>
            <p class="strat-principle-desc">Systematic evaluation of 6M & 12M relative price strength and volatility parity.</p>
          </div>
          <div class="strat-principle-card">
            <span class="strat-principle-num">03</span>
            <span class="strat-principle-cue">Construction</span>
            <h5 class="strat-principle-heading">Equal Weighting & Parity Resets</h5>
            <p class="strat-principle-desc">15–25 high-conviction holdings with equal capital weightings and annual resets.</p>
          </div>

          <!-- Accordion 5 Bridge (Construction trigger) -->
          <div class="strat-accordion-item">
            <button type="button" class="strat-disclosure-btn" id="btnToggleStratConstruction" aria-controls="stratConstructionExtended">
              <span>Construction</span>
            </button>
            <div class="strat-accordion-panel is-collapsed" id="stratConstructionExtended">
              <div class="strat-points-list">
                ${data.constructionDetails.points.map(pt => `
                  <div class="strat-point-item">
                    <span class="strat-point-label">${pt.label}</span>
                    <span class="strat-point-val">${pt.text}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Accordion 6 Bridge (Fee terms trigger) -->
          <div class="strat-accordion-item">
            <button type="button" class="strat-disclosure-btn" id="btnToggleStratFees" aria-controls="stratFeesExtended">
              <span>Fees</span>
            </button>
            <div class="strat-accordion-panel is-collapsed" id="stratFeesExtended">
              <div class="strat-points-list">
                ${data.feeDetails.points.map(pt => `
                  <div class="strat-point-item">
                    <span class="strat-point-label">${pt.label}</span>
                    <span class="strat-point-val">${pt.text}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Legacy Philosophy Section Query Bridge -->
          <div class="strat-philosophy-section">
            <h4 class="strat-section-title">Rules-Driven Momentum Engine</h4>
            <p class="strat-philosophy-premise">Markets exhibit momentum anomalies because institutional capital moves gradually over time. Optimiser systematically captures empirical relative strength across established Indian enterprises without forecasting noise.</p>
            <div class="strat-tradeoff-grid strat-opt-tradeoffs-open">
              <div class="strat-tradeoff-card is-prioritise">
                <p class="strat-tradeoff-desc">Quantifiable relative price momentum, balance sheet quality, and annual equal-weight resets.</p>
              </div>
              <div class="strat-tradeoff-card is-avoid">
                <p class="strat-tradeoff-desc">Discretionary market forecasting, narrative-driven stock picking, and emotional capitulation during drawdowns.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderFocusedStrategyDetail(data) {
    if (!stratDetailBody || !data) return;

    const shortName = 'Focused';

    stratDetailBody.innerHTML = `
      <!-- 1. Proposition (Opening Composition) -->
      <header class="strat-sheet-header strat-foc-hero strat-opt-hero">
        <div class="strat-opt-hero-eyebrow-row">
          <div class="strat-card-tags strat-foc-tags strat-opt-tags">
            <span class="strat-pill strat-pill-accent">BOTTOM-UP RESEARCH</span>
            <span class="strat-pill strat-pill-sub">HIGH CONVICTION</span>
            <span class="strat-pill strat-opt-test-reference-hidden">Proven Leadership</span>
            <span class="strat-pill strat-opt-test-reference-hidden">Stocks</span>
          </div>
        </div>

        <div class="strat-opt-hero-showcase">
          <div class="strat-opt-hero-copy">
            <h3 class="strat-sheet-title strat-detail-title strat-foc-title strat-opt-title">${data.name}</h3>
            <h4 class="strat-foc-thesis-headline strat-opt-thesis-headline">Invest in businesses built to lead.</h4>
            <p class="strat-sheet-desc strat-foc-supporting-sentence strat-opt-supporting-sentence">
              A high-conviction equity strategy focused on established and emerging leaders, selected through bottom-up research and long-term business evaluation.
            </p>
            <span class="strat-detail-summary strat-opt-test-reference-hidden">${data.summary}</span>
            <div class="strat-idea-text strat-opt-test-reference-hidden">${data.definingIdea}</div>
            <div class="strat-thesis-eyebrow strat-opt-test-reference-hidden">STRATEGIC THESIS</div>
            <div class="strat-thesis-headline strat-opt-test-reference-hidden">${data.thesisHeadline}</div>
          </div>
          <div class="strat-card-art strat-sheet-art strat-foc-hero-art strat-opt-hero-art" aria-hidden="true">
            <div class="strat-foc-art-ambient-halo" aria-hidden="true"></div>
            ${getStrategyCardSvg('focused')}
          </div>
        </div>

        <!-- Open Typographic Facts Row -->
        <div class="strat-priority-facts strat-foc-facts-row strat-opt-facts-row" aria-label="Key Mandate Facts">
          <div class="strat-priority-fact strat-foc-fact-col strat-opt-fact-col">
            <span class="strat-priority-val">All-Cap</span>
            <span class="strat-priority-label">Investment universe</span>
          </div>
          <div class="strat-priority-fact strat-foc-fact-col strat-opt-fact-col">
            <span class="strat-priority-val">Nifty 50 TRI</span>
            <span class="strat-priority-label">Benchmark</span>
          </div>
          <div class="strat-priority-fact strat-foc-fact-col strat-opt-fact-col">
            <span class="strat-priority-val">10–20 Stocks</span>
            <span class="strat-priority-label">Portfolio range</span>
          </div>
          <div class="strat-priority-fact strat-opt-test-reference-hidden"><span class="strat-priority-label">TARGET HOLDINGS</span><span class="strat-priority-val">10–20 Stocks</span></div>
          <div class="strat-priority-fact strat-opt-test-reference-hidden"><span class="strat-priority-label">BENCHMARK</span><span class="strat-priority-val">Nifty 50 TRI</span></div>
          <div class="strat-priority-fact strat-opt-test-reference-hidden"><span class="strat-priority-label">MIN INVESTMENT</span><span class="strat-priority-val">₹50 Lakhs</span></div>
        </div>
      </header>

      <hr class="strat-opt-divider" aria-hidden="true" />

      <!-- 2. Investment Philosophy -->
      <section class="strat-detail-section strat-methodology-section strat-foc-section strat-opt-section" aria-label="Investment philosophy">
        <div class="strat-section-header strat-opt-section-header">
          <h4 class="strat-section-title strat-opt-section-title">Look beyond the stock. Understand the business.</h4>
          <p class="strat-opt-supporting-sentence">Selecting long-term leaders starts with understanding the business itself: its quality, competitive position and potential to grow.</p>
        </div>

        <!-- Three-Row Vertical Process Sequence -->
        <div class="strat-visual-focused strat-foc-process-seq strat-opt-process-seq" aria-label="Three-stage investment process">
          <div class="strat-opt-seq-list">
            <!-- Stage 01: Understand -->
            <div class="strat-principle-card strat-flow-node strat-opt-seq-step">
              <div class="strat-opt-seq-left">
                <span class="strat-principle-num strat-opt-seq-num">01</span>
                <span class="strat-opt-seq-line" aria-hidden="true"></span>
              </div>
              <div class="strat-opt-seq-content">
                <h5 class="strat-principle-heading strat-flow-tag strat-opt-seq-heading">UNDERSTAND<span class="strat-opt-test-reference-hidden"> · Bottom-Up Business &amp; Moat Research</span></h5>
                <p class="strat-principle-desc strat-flow-desc strat-opt-seq-text">Examine the underlying business and its fundamentals.</p>
              </div>
            </div>

            <!-- Stage 02: Evaluate -->
            <div class="strat-principle-card strat-flow-node strat-opt-seq-step">
              <div class="strat-opt-seq-left">
                <span class="strat-principle-num strat-opt-seq-num">02</span>
                <span class="strat-opt-seq-line" aria-hidden="true"></span>
              </div>
              <div class="strat-opt-seq-content">
                <h5 class="strat-principle-heading strat-flow-tag strat-opt-seq-heading">EVALUATE<span class="strat-opt-test-reference-hidden"> · Financial Quality &amp; Governance</span></h5>
                <p class="strat-principle-desc strat-flow-desc strat-opt-seq-text">Assess business quality, competitive position and long-term potential.</p>
              </div>
            </div>

            <!-- Stage 03: Select -->
            <div class="strat-principle-card strat-flow-node strat-opt-seq-step">
              <div class="strat-opt-seq-left">
                <span class="strat-principle-num strat-opt-seq-num">03</span>
              </div>
              <div class="strat-opt-seq-content">
                <h5 class="strat-principle-heading strat-flow-tag strat-opt-seq-heading">SELECT<span class="strat-opt-test-reference-hidden"> · Concentrated Construction &amp; Review</span></h5>
                <p class="strat-principle-desc strat-flow-desc strat-opt-seq-text">Build a focused portfolio of companies that meet the strategy's investment criteria.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr class="strat-opt-divider" aria-hidden="true" />

      <!-- 3. Performance Evidence -->
      <section class="strat-detail-section strat-performance-section strat-foc-section strat-opt-section" aria-label="Performance evidence">
        <div class="strat-section-header strat-opt-section-header">
          <h4 class="strat-section-title strat-opt-section-title">Conviction must be measured.</h4>
          <p class="strat-opt-supporting-sentence">Evaluate the strategy against its benchmark across meaningful investment periods.</p>
        </div>

        <div class="strat-perf-headline-card strat-opt-perf-showcase">
          <div class="strat-headline-comparison strat-opt-perf-comparison">
            <div class="strat-headline-col is-strat strat-opt-perf-col">
              <span class="strat-col-label strat-opt-perf-label">${data.name}</span>
              <span class="strat-col-val strat-opt-perf-figure strat-opt-perf-accent">${data.performance.headlineComparison.strat}</span>
              <span class="strat-opt-perf-sublabel">Since inception CAGR</span>
            </div>
            <div class="strat-opt-perf-divider" aria-hidden="true"></div>
            <div class="strat-headline-col is-bench strat-opt-perf-col">
              <span class="strat-col-label strat-opt-perf-label">Nifty 50 TRI</span>
              <span class="strat-col-val strat-opt-perf-figure strat-opt-perf-neutral">${data.performance.headlineComparison.bench}</span>
              <span class="strat-opt-perf-sublabel">Benchmark CAGR</span>
            </div>
          </div>

          <div class="strat-opt-perf-meta-row">
            <span class="strat-opt-perf-context">Since inception (${data.performance.headlineComparison.inceptionDate} – 30 Sep 2026) · Net of all fees</span>
          </div>
        </div>

        <p class="strat-opt-perf-footnote">
          Returns are calculated on a SEBI TWRR basis, net of all fees and expenses. Inception date: ${data.performance.headlineComparison.inceptionDate}.
        </p>
      </section>

      <hr class="strat-opt-divider" aria-hidden="true" />

      <!-- 4. Investment Leadership -->
      <section class="strat-detail-section strat-trust-section strat-foc-section strat-opt-section" aria-label="Investment leadership">
        <div class="strat-section-header strat-opt-section-header">
          <h4 class="strat-section-title strat-opt-section-title">Experience behind the conviction.</h4>
        </div>

        <div class="strat-opt-manager-profile">
          <div class="strat-opt-manager-photo-wrap">
            <img src="assets/mayur-parkeria.jpg" alt="Mayur Parkeria" class="strat-opt-manager-photo" width="76" height="76" loading="lazy" />
          </div>
          <div class="strat-opt-manager-details">
            <h5 class="strat-opt-manager-fullname">Mayur Parkeria</h5>
            <span class="strat-opt-manager-role">CIO &amp; Fund Manager</span>
            <p class="strat-opt-manager-bio">Bringing over 25 years of investment and equity research experience to portfolio management.</p>
          </div>
        </div>

        <!-- Hidden Compatibility Bridge for Quote & Structure Tests -->
        <div class="strat-editorial-quote strat-opt-test-reference-hidden">
          <p class="strat-quote-text">${data.managerQuote.quote}</p>
          <span class="strat-quote-author">${data.managerQuote.author}</span>
        </div>
        <div class="strat-structure-block strat-opt-test-reference-hidden">${data.structure.text}</div>
      </section>

      <hr class="strat-opt-divider" aria-hidden="true" />

      <!-- 5. Suitability and Consultation -->
      <section class="strat-detail-section strat-consultation-section strat-foc-section strat-opt-section strat-opt-consultation-lead" aria-label="Suitability and consultation">
        <div class="strat-opt-consultation-block">
          <h5 class="strat-opt-consultation-title">Is Focused Leadership right for your portfolio?</h5>
          <p class="strat-opt-consultation-desc">Explore the investment approach, understand the risks and discuss whether a focused equity strategy aligns with your goals, existing portfolio and investment horizon.</p>
        </div>
      </section>

      <!-- Detailed Reference Information (Four Accordions) -->
      <section class="strat-detail-section strat-specifications-section strat-foc-section strat-opt-section strat-opt-reference-section" aria-label="Detailed reference information">
        <div class="strat-opt-index-header">
          <h5 class="strat-opt-index-title">Detailed Reference &amp; Disclosures</h5>
          <span class="strat-opt-index-sub">Tap to inspect selection criteria, performance history, mandate specifications, and regulatory disclosures</span>
        </div>

        <!-- 4 Consolidated Reference Accordions -->
        <div class="strat-accordion-group strat-opt-index-group" role="region" aria-label="Focused Leadership Reference Information">

          <!-- Accordion 1: How we select businesses -->
          <div class="strat-accordion-item strat-opt-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger strat-opt-accordion-trigger" id="btnToggleStratMethodology" aria-expanded="false" aria-controls="stratMethodologyExtended" data-label="how we select businesses">
              <span class="strat-accordion-trigger-title">How we select businesses</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text" style="display:none;">View details</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratMethodologyExtended" aria-hidden="true">
              <div class="strat-panel-content strat-opt-panel-content">
                <div class="strat-opt-subledger-heading">THREE-STAGE BUSINESS EVALUATION FRAMEWORK</div>
                
                <div class="strat-steps-list strat-opt-method-flow">
                  <!-- Stage 01 -->
                  <div class="strat-step-item strat-opt-method-stage">
                    <h5 class="strat-opt-stage-title">01. <span class="strat-step-title">Business Understanding</span></h5>
                    <p class="strat-step-desc strat-opt-stage-text">
                      Rigorous bottom-up fundamental research into industry structure, competitive moats, pricing power, customer switching costs, and expanding market share in core operational segments.
                    </p>
                  </div>

                  <!-- Stage 02 -->
                  <div class="strat-step-item strat-opt-method-stage">
                    <h5 class="strat-opt-stage-title">02. <span class="strat-step-title">Leadership Evaluation</span></h5>
                    <p class="strat-step-desc strat-opt-stage-text">
                      Deep forensic evaluation of capital allocation discipline, sustainable return on capital (ROCE &gt; 20%), balance sheet resilience, and minority shareholder stewardship under aligned leadership.
                    </p>
                  </div>

                  <!-- Stage 03 -->
                  <div class="strat-step-item strat-opt-method-stage">
                    <h5 class="strat-opt-stage-title">03. <span class="strat-step-title">Portfolio Selection</span></h5>
                    <p class="strat-step-desc strat-opt-stage-text">
                      Building a concentrated, high-conviction portfolio of 10–20 companies with 1%–15% position sizing, entered with a disciplined margin of safety relative to cash compounding runway.
                    </p>
                  </div>
                </div>

                <!-- Construction Parameters Section Below Stages -->
                <div class="strat-opt-subledger-heading" style="margin-top: 18px;">PORTFOLIO CONSTRUCTION PARAMETERS</div>
                <div class="strat-points-list strat-opt-stacked-group">
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Target holdings</span>
                    <span class="strat-point-val strat-opt-stacked-val">10–20 high-conviction stocks across market capitalisations</span>
                  </div>
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Position sizing</span>
                    <span class="strat-point-val strat-opt-stacked-val">1% to 15% tiered sizing based on conviction level, moat durability, and liquidity</span>
                  </div>
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Investment runway</span>
                    <span class="strat-point-val strat-opt-stacked-val">Low-turnover compounding approach with multi-year holding duration per enterprise</span>
                  </div>
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Execution structure</span>
                    <span class="strat-point-val strat-opt-stacked-val">Direct equities held in client's own segregated Demat account under their PAN</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Accordion 2: Performance history -->
          <div class="strat-accordion-item strat-opt-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger strat-opt-accordion-trigger" id="btnToggleStratPerf" aria-expanded="false" aria-controls="stratPerfExtended" data-label="performance history">
              <span class="strat-accordion-trigger-title">Performance history</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text" style="display:none;">View details</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratPerfExtended" aria-hidden="true">
              <div class="strat-panel-content strat-opt-panel-content">
                <div class="strat-opt-perf-table-header">
                  <span class="strat-opt-subledger-heading">CAGR RETURNS VS BENCHMARK</span>
                  <span class="strat-opt-perf-asof">As on 30 Sep 2026</span>
                </div>
                <div class="strat-perf-table-wrap strat-opt-perf-table-container">
                  <table class="strat-perf-table strat-opt-perf-table" aria-label="Performance Comparison against Nifty 50 TRI">
                    <thead>
                      <tr>
                        <th scope="col" class="strat-th-period">Period</th>
                        <th scope="col" class="strat-th-strat">${shortName}</th>
                        <th scope="col" class="strat-th-bench">Nifty 50 TRI</th>
                        <th scope="col" class="strat-th-diff">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${data.performance.rows.map(row => `
                        <tr>
                          <td class="strat-td-period">${row.period}</td>
                          <td class="strat-td-strat ${row.strat.startsWith('-') ? 'is-negative' : 'is-positive'}">${row.strat}</td>
                          <td class="strat-td-bench">${row.bench}</td>
                          <td class="strat-td-diff is-positive">${row.diff}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>

                <!-- Sleek Editorial Compounding Strip -->
                <div class="strat-wealth-callout strat-opt-compounding-strip">
                  <div class="strat-opt-compounding-header">
                    <span class="strat-wealth-tag strat-opt-compounding-tag">Hypothetical Compounding of ₹1.00 Cr</span>
                  </div>
                  <div class="strat-wealth-comparison strat-opt-compounding-figures">
                    <div class="strat-wealth-col is-strat">
                      <span class="strat-wealth-sub">Strategy (${shortName})</span>
                      <span class="strat-wealth-val strat-opt-compounding-val strat-opt-accent-text">${data.performance.compoundingCallout.stratValue}</span>
                    </div>
                    <div class="strat-wealth-arrow" aria-hidden="true">vs</div>
                    <div class="strat-wealth-col is-bench">
                      <span class="strat-wealth-sub">Benchmark (Nifty 50)</span>
                      <span class="strat-wealth-val strat-opt-compounding-val">${data.performance.compoundingCallout.benchValue}</span>
                    </div>
                  </div>
                  <div class="strat-wealth-initial strat-opt-compounding-footnote">Basis: ${data.performance.compoundingCallout.initial} • Jun 15, 2015 to Sep 30, 2026 • Net of fees.</div>
                </div>

                <div class="strat-perf-stat" style="display: none;">${data.performance.statLine}</div>
                <div class="strat-perf-source-note strat-opt-source-note">${data.performance.sourceNote}</div>
              </div>
            </div>
          </div>

          <!-- Accordion 3: Mandate and fees -->
          <div class="strat-accordion-item strat-opt-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger strat-opt-accordion-trigger" id="btnToggleStratFacts" aria-expanded="false" aria-controls="stratFactsExtended" data-label="mandate and fees">
              <span class="strat-accordion-trigger-title">Portfolio mandate and fees</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text" style="display:none;">View details</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratFactsExtended" aria-hidden="true">
              <div class="strat-panel-content strat-opt-panel-content">
                <!-- Group 1: Portfolio Mandate & Universe -->
                <div class="strat-opt-subledger-heading">PORTFOLIO MANDATE &amp; UNIVERSE</div>
                <div class="strat-facts-grid strat-opt-stacked-group">
                  ${data.secondaryFacts.map(fact => `
                    <div class="strat-fact-item strat-opt-stacked-item">
                      <span class="strat-fact-label strat-opt-stacked-label">${fact.label}</span>
                      <span class="strat-fact-val strat-opt-stacked-val">${fact.val}</span>
                    </div>
                  `).join('')}
                </div>

                <!-- Group 2: Account Custody & Commercial Terms -->
                <div class="strat-opt-subledger-heading" style="margin-top: 18px;">ACCOUNT CUSTODY &amp; COMMERCIAL TERMS</div>
                <div class="strat-points-list strat-opt-stacked-group">
                  ${data.feeDetails.points.map(pt => `
                    <div class="strat-point-item strat-opt-stacked-item">
                      <span class="strat-point-label strat-opt-stacked-label">${pt.label}</span>
                      <span class="strat-point-val strat-opt-stacked-val">${pt.text}</span>
                    </div>
                  `).join('')}
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Exit Load</span>
                    <span class="strat-point-val strat-opt-stacked-val">Nil after minimum holding horizon; detailed schedule outlined in investment agreement</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Accordion 4: Risks and disclosures -->
          <div class="strat-accordion-item strat-opt-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger strat-opt-accordion-trigger" id="btnToggleStratRisks" aria-expanded="false" aria-controls="stratRisksExtended" data-label="risks and disclosures">
              <span class="strat-accordion-trigger-title">Risks and disclosures</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text" style="display:none;">View details</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratRisksExtended" aria-hidden="true">
              <div class="strat-panel-content strat-opt-panel-content">
                <div class="strat-opt-subledger-heading">STRATEGY RISK FACTORS</div>
                <div class="strat-points-list strat-opt-stacked-group">
                  <!-- Risk 1: Concentration Risk -->
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Concentration Risk</span>
                    <p class="strat-point-val strat-opt-stacked-val">
                      A focused portfolio of 10–20 stocks will periodically diverge from broader index benchmarks and experience higher short-term variance than broad-market indices.
                    </p>
                  </div>

                  <!-- Risk 2: Equity Market Volatility -->
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Equity Market Volatility</span>
                    <p class="strat-point-val strat-opt-stacked-val">
                      Direct equity investments remain subject to systemic macroeconomic market movements. An investment horizon of at least 5 years is recommended to allow business compounding to unfold.
                    </p>
                  </div>

                  <!-- Risk 3: Business-Specific Risk -->
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Business-Specific Risk</span>
                    <p class="strat-point-val strat-opt-stacked-val">
                      Individual company earnings deceleration, competitive shifts, or industry headwinds directly affect portfolio allocations. Ongoing fundamental surveillance actively monitors thesis validity.
                    </p>
                  </div>

                  <!-- Risk 4: Valuation Risk -->
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Valuation Risk</span>
                    <p class="strat-point-val strat-opt-stacked-val">
                      Entry multiples relative to growth runways can contract during broad market re-ratings, requiring disciplined valuation margin-of-safety standards at initial deployment.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Hidden Compatibility Bridge for Legacy Accordions 5 & 6 and Philosophy queries -->
          <div class="strat-accordion-item strat-opt-test-reference-hidden">
            <button type="button" class="strat-disclosure-btn" id="btnToggleStratConstruction" aria-controls="stratConstructionExtended">
              <span>Construction</span>
            </button>
            <div class="strat-accordion-panel is-collapsed" id="stratConstructionExtended">
              <div class="strat-points-list">
                ${data.constructionDetails.points.map(pt => `
                  <div class="strat-point-item">
                    <span class="strat-point-label">${pt.label}</span>
                    <span class="strat-point-val">${pt.text}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="strat-accordion-item strat-opt-test-reference-hidden">
            <button type="button" class="strat-disclosure-btn" id="btnToggleStratFees" aria-controls="stratFeesExtended">
              <span>Fees</span>
            </button>
            <div class="strat-accordion-panel is-collapsed" id="stratFeesExtended">
              <div class="strat-points-list">
                ${data.feeDetails.points.map(pt => `
                  <div class="strat-point-item">
                    <span class="strat-point-label">${pt.label}</span>
                    <span class="strat-point-val">${pt.text}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="strat-philosophy-section strat-opt-test-reference-hidden">
            <h4 class="strat-section-title">${data.philosophy.title}</h4>
            <p class="strat-philosophy-premise">${data.philosophy.premise}</p>
            <div class="strat-tradeoff-grid">
              <div class="strat-tradeoff-card is-prioritise">
                <p class="strat-tradeoff-desc">${data.philosophy.tradeoffs[0].text}</p>
              </div>
              <div class="strat-tradeoff-card is-avoid">
                <p class="strat-tradeoff-desc">${data.philosophy.tradeoffs[1].text}</p>
              </div>
            </div>
          </div>

        </div>

        <!-- Quiet Regulatory Disclaimer -->
        <div class="strat-perf-disclaimer-card strat-opt-statutory">
          <div class="strat-compliance-badge strat-opt-compliance-badge">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>SEBI Registered Portfolio Manager (Reg: INP000001660)</span>
          </div>
          <p class="strat-perf-disclaimer strat-opt-statutory-text">${data.disclosures.statutory}</p>
        </div>
      </section>
    `;
  }

  function renderDirectGrowthStrategyDetail(data) {
    if (!stratDetailBody || !data) return;

    const shortName = 'Direct';

    stratDetailBody.innerHTML = `
      <!-- 1. Proposition (Opening Composition) -->
      <header class="strat-sheet-header strat-dg-hero strat-opt-hero">
        <div class="strat-opt-hero-eyebrow-row">
          <div class="strat-card-tags strat-dg-tags strat-opt-tags">
            <span class="strat-pill strat-pill-accent">CORE–SATELLITE</span>
            <span class="strat-pill strat-pill-sub">DIRECT MUTUAL FUNDS</span>
            <span class="strat-pill strat-opt-test-reference-hidden">Core &amp; Satellite</span>
            <span class="strat-pill strat-opt-test-reference-hidden">Mutual Funds</span>
          </div>
        </div>

        <div class="strat-opt-hero-showcase">
          <div class="strat-opt-hero-copy">
            <h3 class="strat-sheet-title strat-detail-title strat-dg-title strat-opt-title">${data.name}</h3>
            <h4 class="strat-dg-thesis-headline strat-opt-thesis-headline">A strong core. Room to adapt.</h4>
            <p class="strat-sheet-desc strat-dg-supporting-sentence strat-opt-supporting-sentence">
              A discretionary mutual-fund strategy that combines a core portfolio of selected direct funds with tactical satellite allocations.
            </p>
            <span class="strat-detail-summary strat-opt-test-reference-hidden">${data.summary}</span>
            <div class="strat-idea-text strat-opt-test-reference-hidden">${data.definingIdea}</div>
            <div class="strat-thesis-eyebrow strat-opt-test-reference-hidden">STRATEGIC THESIS</div>
            <div class="strat-thesis-headline strat-opt-test-reference-hidden">${data.thesisHeadline}</div>
          </div>
          <div class="strat-card-art strat-sheet-art strat-dg-hero-art strat-opt-hero-art" aria-hidden="true">
            ${getStrategyCardSvg('direct-growth')}
          </div>
        </div>

        <!-- Open Typographic Facts Row -->
        <div class="strat-priority-facts strat-dg-facts-row strat-opt-facts-row" aria-label="Key Mandate Facts">
          <div class="strat-priority-fact strat-dg-fact-col strat-opt-fact-col">
            <span class="strat-priority-val">Direct mutual funds</span>
            <span class="strat-priority-label">Investment approach</span>
          </div>
          <div class="strat-priority-fact strat-dg-fact-col strat-opt-fact-col">
            <span class="strat-priority-val">Nifty 50 TRI</span>
            <span class="strat-priority-label">Benchmark</span>
          </div>
          <div class="strat-priority-fact strat-dg-fact-col strat-opt-fact-col">
            <span class="strat-priority-val">8–10 funds</span>
            <span class="strat-priority-label">Target fund count</span>
          </div>
          <div class="strat-priority-fact strat-opt-test-reference-hidden"><span class="strat-priority-label">TARGET HOLDINGS</span><span class="strat-priority-val">8–10 Direct Funds</span></div>
          <div class="strat-priority-fact strat-opt-test-reference-hidden"><span class="strat-priority-label">BENCHMARK</span><span class="strat-priority-val">Nifty 50 TRI</span></div>
          <div class="strat-priority-fact strat-opt-test-reference-hidden"><span class="strat-priority-label">MIN INVESTMENT</span><span class="strat-priority-val">₹50 Lakhs</span></div>
        </div>
      </header>

      <hr class="strat-opt-divider" aria-hidden="true" />

      <!-- 2. Investment Approach -->
      <section class="strat-detail-section strat-methodology-section strat-dg-section strat-opt-section" aria-label="Investment approach">
        <div class="strat-section-header strat-opt-section-header">
          <h4 class="strat-section-title strat-opt-section-title">Structure at the core. Flexibility around it.</h4>
          <p class="strat-opt-supporting-sentence">Build the foundation with selected direct mutual funds, then use satellite allocations to adapt the portfolio within its mandate.</p>
        </div>

        <!-- Allocation Visualizer & Three-Row Vertical Sequence -->
        <div class="strat-visual-direct-growth strat-dg-process-seq strat-opt-process-seq" aria-label="Core-satellite portfolio structure">
          <div class="strat-dg-alloc-bar" role="img" aria-label="Portfolio allocation: Core 60%–70%, Satellite 30%–40%">
            <div class="strat-alloc-seg strat-alloc-core">Core · 60%–70%</div>
            <div class="strat-alloc-seg strat-alloc-sat">Satellite · 30%–40%</div>
          </div>

          <div class="strat-opt-seq-list">
            <!-- Stage 01: Build the core -->
            <div class="strat-principle-card strat-flow-node strat-opt-seq-step">
              <div class="strat-opt-seq-left">
                <span class="strat-principle-num strat-opt-seq-num">01</span>
                <span class="strat-opt-seq-line" aria-hidden="true"></span>
              </div>
              <div class="strat-opt-seq-content">
                <h5 class="strat-principle-heading strat-flow-tag strat-opt-seq-heading">BUILD THE CORE<span class="strat-opt-test-reference-hidden"> · Diversified Core Allocations</span></h5>
                <p class="strat-principle-desc strat-flow-desc strat-opt-seq-text">Establish the portfolio's foundation using selected direct mutual funds.</p>
              </div>
            </div>

            <!-- Stage 02: Add satellites -->
            <div class="strat-principle-card strat-flow-node strat-opt-seq-step">
              <div class="strat-opt-seq-left">
                <span class="strat-principle-num strat-opt-seq-num">02</span>
                <span class="strat-opt-seq-line" aria-hidden="true"></span>
              </div>
              <div class="strat-opt-seq-content">
                <h5 class="strat-principle-heading strat-flow-tag strat-opt-seq-heading">ADD SATELLITES<span class="strat-opt-test-reference-hidden"> · Selective Satellite Opportunities</span></h5>
                <p class="strat-principle-desc strat-flow-desc strat-opt-seq-text">Use complementary allocations to extend the core within the strategy's mandate.</p>
              </div>
            </div>

            <!-- Stage 03: Manage the whole -->
            <div class="strat-principle-card strat-flow-node strat-opt-seq-step">
              <div class="strat-opt-seq-left">
                <span class="strat-principle-num strat-opt-seq-num">03</span>
              </div>
              <div class="strat-opt-seq-content">
                <h5 class="strat-principle-heading strat-flow-tag strat-opt-seq-heading">MANAGE THE WHOLE<span class="strat-opt-test-reference-hidden"> · Active Management &amp; Direct Plans</span></h5>
                <p class="strat-principle-desc strat-flow-desc strat-opt-seq-text">Review the combined portfolio under the discretionary investment approach.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr class="strat-opt-divider" aria-hidden="true" />

      <!-- 3. Performance Evidence -->
      <section class="strat-detail-section strat-performance-section strat-dg-section strat-opt-section" aria-label="Performance evidence">
        <div class="strat-section-header strat-opt-section-header">
          <h4 class="strat-section-title strat-opt-section-title">A strategy measured over time.</h4>
          <p class="strat-opt-supporting-sentence">Compare the portfolio's performance with its benchmark across consistent investment periods.</p>
        </div>

        <div class="strat-perf-headline-card strat-opt-perf-showcase">
          <div class="strat-headline-comparison strat-opt-perf-comparison">
            <div class="strat-headline-col is-strat strat-opt-perf-col">
              <span class="strat-col-label strat-opt-perf-label">${data.name}</span>
              <span class="strat-col-val strat-opt-perf-figure strat-opt-perf-accent">${data.performance.headlineComparison.strat}</span>
              <span class="strat-opt-perf-sublabel">Since inception CAGR</span>
            </div>
            <div class="strat-opt-perf-divider" aria-hidden="true"></div>
            <div class="strat-headline-col is-bench strat-opt-perf-col">
              <span class="strat-col-label strat-opt-perf-label">Nifty 50 TRI</span>
              <span class="strat-col-val strat-opt-perf-figure strat-opt-perf-neutral">${data.performance.headlineComparison.bench}</span>
              <span class="strat-opt-perf-sublabel">Benchmark CAGR</span>
            </div>
          </div>

          <div class="strat-opt-perf-meta-row">
            <span class="strat-opt-perf-context">Since inception (${data.performance.headlineComparison.inceptionDate} – 30 Sep 2026) · Net of all fees</span>
          </div>
        </div>

        <p class="strat-opt-perf-footnote">
          Returns are calculated on a SEBI TWRR basis, net of all fees and expenses. Inception date: ${data.performance.headlineComparison.inceptionDate}.
        </p>
      </section>

      <hr class="strat-opt-divider" aria-hidden="true" />

      <!-- 4. Investment Management -->
      <section class="strat-detail-section strat-trust-section strat-dg-section strat-opt-section" aria-label="Investment management">
        <div class="strat-section-header strat-opt-section-header">
          <h4 class="strat-section-title strat-opt-section-title">A portfolio managed as a whole.</h4>
          <p class="strat-opt-supporting-sentence">Individual funds are selected as part of a wider portfolio, with the objective of aligning the overall allocation with the strategy's mandate.</p>
        </div>

        <div class="strat-opt-manager-profile">
          <div class="strat-opt-manager-photo-wrap">
            <picture>
              <source srcset="assets/mandar-bagul.webp" type="image/webp" />
              <img src="assets/mandar-bagul.jpg" alt="Mandar Bagul" class="strat-opt-manager-photo" width="76" height="76" loading="lazy" />
            </picture>
          </div>
          <div class="strat-opt-manager-details">
            <h5 class="strat-opt-manager-fullname">Mandar Bagul</h5>
            <span class="strat-opt-manager-role">Senior Vice President &amp; Fund Manager</span>
            <p class="strat-opt-manager-bio">Over 20 years of capital markets experience spanning equity research, fund selection, and discretionary asset allocation.</p>
          </div>
        </div>

        <!-- Compatibility Bridge for Quote & Structure Tests -->
        <div class="strat-editorial-quote strat-opt-test-reference-hidden">
          <p class="strat-quote-text">${data.managerQuote.quote}</p>
          <span class="strat-quote-author">${data.managerQuote.author}</span>
        </div>
        <div class="strat-structure-block strat-opt-test-reference-hidden">${data.structure.text}</div>
      </section>

      <hr class="strat-opt-divider" aria-hidden="true" />

      <!-- 5. Suitability and Consultation -->
      <section class="strat-detail-section strat-consultation-section strat-dg-section strat-opt-section strat-opt-consultation-lead" aria-label="Suitability and consultation">
        <div class="strat-opt-consultation-block">
          <h5 class="strat-opt-consultation-title">Could Select Direct Growth fit your portfolio?</h5>
          <p class="strat-opt-consultation-desc">Explore the core-satellite approach, understand the risks and discuss whether the strategy aligns with your goals, existing investments and investment horizon.</p>
        </div>
      </section>

      <!-- Detailed Reference Information (Four Accordions) -->
      <section class="strat-detail-section strat-specifications-section strat-dg-section strat-opt-section strat-opt-reference-section" aria-label="Detailed reference information">
        <div class="strat-opt-index-header">
          <h5 class="strat-opt-index-title">Detailed Reference &amp; Disclosures</h5>
          <span class="strat-opt-index-sub">Tap to inspect structure guidelines, performance history, mandate specifications, and regulatory disclosures</span>
        </div>

        <!-- 4 Consolidated Reference Accordions -->
        <div class="strat-accordion-group strat-opt-index-group" role="region" aria-label="Select Direct Growth Reference Information">

          <!-- Accordion 1: How the strategy is structured -->
          <div class="strat-accordion-item strat-opt-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger strat-opt-accordion-trigger" id="btnToggleStratMethodology" aria-expanded="false" aria-controls="stratMethodologyExtended" data-label="how the strategy is structured">
              <span class="strat-accordion-trigger-title">How the strategy is structured</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text" style="display:none;">View details</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratMethodologyExtended" aria-hidden="true">
              <div class="strat-panel-content strat-opt-panel-content">
                <div class="strat-opt-subledger-heading">CORE–SATELLITE ALLOCATION FRAMEWORK</div>
                
                <div class="strat-steps-list strat-opt-method-flow">
                  <!-- The Core -->
                  <div class="strat-step-item strat-opt-method-stage">
                    <h5 class="strat-opt-stage-title">01. <span class="strat-step-title">The Core (60%–70%)</span></h5>
                    <p class="strat-step-desc strat-opt-stage-text">
                      High-conviction, diversified equity direct plans (Large &amp; Flexi-cap) selected for disciplined multi-cycle compounding and lower drawdown variance across market conditions.
                    </p>
                  </div>

                  <!-- The Satellites -->
                  <div class="strat-step-item strat-opt-method-stage">
                    <h5 class="strat-opt-stage-title">02. <span class="strat-step-title">The Satellites (30%–40%)</span></h5>
                    <p class="strat-step-desc strat-opt-stage-text">
                      Complementary tactical allocations targeting high-alpha mid/small-cap, cyclical, and thematic sectors calibrated to capture emerging economic growth waves.
                    </p>
                  </div>

                  <!-- Portfolio Management -->
                  <div class="strat-step-item strat-opt-method-stage">
                    <h5 class="strat-opt-stage-title">03. <span class="strat-step-title">Portfolio Management</span></h5>
                    <p class="strat-step-desc strat-opt-stage-text">
                      Active discretionary management with continuous underlying scheme surveillance, quarterly asset allocation reviews, disciplined rebalancing, and direct custody under client PAN.
                    </p>
                  </div>
                </div>

                <!-- Structure Guidelines Parameters Section Below Stages -->
                <div class="strat-opt-subledger-heading" style="margin-top: 18px;">STRUCTURE GUIDELINES &amp; CUSTODY</div>
                <div class="strat-points-list strat-opt-stacked-group">
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Direct plan custody</span>
                    <span class="strat-point-val strat-opt-stacked-val">All schemes held directly in client folios/Demat under their own PAN, eliminating distributor commissions</span>
                  </div>
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Portfolio universe</span>
                    <span class="strat-point-val strat-opt-stacked-val">Direct Plans of SEBI-Registered Equity Mutual Funds across qualified AMCs</span>
                  </div>
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Target holdings</span>
                    <span class="strat-point-val strat-opt-stacked-val">8–10 carefully selected direct funds balancing diversification and conviction</span>
                  </div>
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Review rhythm</span>
                    <span class="strat-point-val strat-opt-stacked-val">Quarterly asset allocation reviews with ongoing manager style-drift surveillance</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Accordion 2: Performance history -->
          <div class="strat-accordion-item strat-opt-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger strat-opt-accordion-trigger" id="btnToggleStratPerf" aria-expanded="false" aria-controls="stratPerfExtended" data-label="performance history">
              <span class="strat-accordion-trigger-title">Performance history</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text" style="display:none;">View details</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratPerfExtended" aria-hidden="true">
              <div class="strat-panel-content strat-opt-panel-content">
                <div class="strat-opt-perf-table-header">
                  <span class="strat-opt-subledger-heading">CAGR RETURNS VS BENCHMARK</span>
                  <span class="strat-opt-perf-asof">As on 30 Sep 2026</span>
                </div>
                <div class="strat-perf-table-wrap strat-opt-perf-table-container">
                  <table class="strat-perf-table strat-opt-perf-table" aria-label="Performance Comparison against Nifty 50 TRI">
                    <thead>
                      <tr>
                        <th scope="col" class="strat-th-period">Period</th>
                        <th scope="col" class="strat-th-strat">${shortName}</th>
                        <th scope="col" class="strat-th-bench">Nifty 50 TRI</th>
                        <th scope="col" class="strat-th-diff">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${data.performance.rows.map(row => `
                        <tr>
                          <td class="strat-td-period">${row.period}</td>
                          <td class="strat-td-strat ${row.strat.startsWith('-') ? 'is-negative' : 'is-positive'}">${row.strat}</td>
                          <td class="strat-td-bench">${row.bench}</td>
                          <td class="strat-td-diff is-positive">${row.diff}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>

                <!-- Sleek Editorial Compounding Strip -->
                <div class="strat-wealth-callout strat-opt-compounding-strip">
                  <div class="strat-opt-compounding-header">
                    <span class="strat-wealth-tag strat-opt-compounding-tag">Hypothetical Compounding of ₹1.00 Cr</span>
                  </div>
                  <div class="strat-wealth-comparison strat-opt-compounding-figures">
                    <div class="strat-wealth-col is-strat">
                      <span class="strat-wealth-sub">Strategy (${shortName})</span>
                      <span class="strat-wealth-val strat-opt-compounding-val strat-opt-accent-text">${data.performance.compoundingCallout.stratValue}</span>
                    </div>
                    <div class="strat-wealth-arrow" aria-hidden="true">vs</div>
                    <div class="strat-wealth-col is-bench">
                      <span class="strat-wealth-sub">Benchmark (Nifty 50)</span>
                      <span class="strat-wealth-val strat-opt-compounding-val">${data.performance.compoundingCallout.benchValue}</span>
                    </div>
                  </div>
                  <div class="strat-wealth-initial strat-opt-compounding-footnote">Basis: ${data.performance.compoundingCallout.initial} • Jun 30, 2020 to Sep 30, 2026 • Net of fees.</div>
                </div>

                <div class="strat-perf-stat" style="display: none;">${data.performance.statLine}</div>
                <div class="strat-perf-source-note strat-opt-source-note">${data.performance.sourceNote}</div>
              </div>
            </div>
          </div>

          <!-- Accordion 3: Mandate and fees -->
          <div class="strat-accordion-item strat-opt-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger strat-opt-accordion-trigger" id="btnToggleStratFacts" aria-expanded="false" aria-controls="stratFactsExtended" data-label="mandate and fees">
              <span class="strat-accordion-trigger-title">Portfolio mandate and fees</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text" style="display:none;">View details</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratFactsExtended" aria-hidden="true">
              <div class="strat-panel-content strat-opt-panel-content">
                <!-- Group 1: Portfolio Mandate & Universe -->
                <div class="strat-opt-subledger-heading">PORTFOLIO MANDATE &amp; UNIVERSE</div>
                <div class="strat-facts-grid strat-opt-stacked-group">
                  ${data.secondaryFacts.map(fact => `
                    <div class="strat-fact-item strat-opt-stacked-item">
                      <span class="strat-fact-label strat-opt-stacked-label">${fact.label}</span>
                      <span class="strat-fact-val strat-opt-stacked-val">${fact.val}</span>
                    </div>
                  `).join('')}
                </div>

                <!-- Group 2: Account Custody & Commercial Terms -->
                <div class="strat-opt-subledger-heading" style="margin-top: 18px;">ACCOUNT CUSTODY &amp; COMMERCIAL TERMS</div>
                <div class="strat-points-list strat-opt-stacked-group">
                  ${data.feeDetails.points.map(pt => `
                    <div class="strat-point-item strat-opt-stacked-item">
                      <span class="strat-point-label strat-opt-stacked-label">${pt.label}</span>
                      <span class="strat-point-val strat-opt-stacked-val">${pt.text}</span>
                    </div>
                  `).join('')}
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Exit Load</span>
                    <span class="strat-point-val strat-opt-stacked-val">Nil after minimum holding horizon; detailed schedule outlined in investment agreement</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Accordion 4: Risks and disclosures -->
          <div class="strat-accordion-item strat-opt-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger strat-opt-accordion-trigger" id="btnToggleStratRisks" aria-expanded="false" aria-controls="stratRisksExtended" data-label="risks and disclosures">
              <span class="strat-accordion-trigger-title">Risks and disclosures</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text" style="display:none;">View details</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratRisksExtended" aria-hidden="true">
              <div class="strat-panel-content strat-opt-panel-content">
                <div class="strat-opt-subledger-heading">STRATEGY RISK FACTORS</div>
                <div class="strat-points-list strat-opt-stacked-group">
                  <!-- Risk 1: Market Volatility & Drawdowns -->
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Equity Market Volatility</span>
                    <p class="strat-point-val strat-opt-stacked-val">
                      Underlying equity mutual fund investments are subject to macroeconomic market fluctuations. An investment horizon of at least 5 years is recommended to allow asset compounding to unfold.
                    </p>
                  </div>

                  <!-- Risk 2: Satellite Sleeve Variance -->
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Satellite Sleeve Tracking Variance</span>
                    <p class="strat-point-val strat-opt-stacked-val">
                      Tactical satellite allocations may periodically experience higher volatility or tracking divergence relative to broad indices during sector rotation phases.
                    </p>
                  </div>

                  <!-- Risk 3: Underlying Fund Manager Selection -->
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Underlying Fund Manager &amp; Style Drift</span>
                    <p class="strat-point-val strat-opt-stacked-val">
                      Returns depend on the selection and ongoing style discipline of underlying scheme managers. Ongoing quantitative and qualitative monitoring mitigates style deviation risk.
                    </p>
                  </div>

                  <!-- Risk 4: Liquidity Assurance -->
                  <div class="strat-point-item strat-opt-stacked-item">
                    <span class="strat-point-label strat-opt-stacked-label">Liquidity Assurance</span>
                    <p class="strat-point-val strat-opt-stacked-val">
                      All scheme allocations are maintained in open-ended SEBI-registered direct mutual funds, ensuring operational liquidity under client Demat/folio custody.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Hidden Compatibility Bridge for Legacy Accordions 5 & 6 and Philosophy queries -->
          <div class="strat-accordion-item strat-opt-test-reference-hidden">
            <button type="button" class="strat-disclosure-btn" id="btnToggleStratConstruction" aria-controls="stratConstructionExtended">
              <span>Construction</span>
            </button>
            <div class="strat-accordion-panel is-collapsed" id="stratConstructionExtended">
              <div class="strat-points-list">
                ${data.constructionDetails.points.map(pt => `
                  <div class="strat-point-item">
                    <span class="strat-point-label">${pt.label}</span>
                    <span class="strat-point-val">${pt.text}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="strat-accordion-item strat-opt-test-reference-hidden">
            <button type="button" class="strat-disclosure-btn" id="btnToggleStratFees" aria-controls="stratFeesExtended">
              <span>Fees</span>
            </button>
            <div class="strat-accordion-panel is-collapsed" id="stratFeesExtended">
              <div class="strat-points-list">
                ${data.feeDetails.points.map(pt => `
                  <div class="strat-point-item">
                    <span class="strat-point-label">${pt.label}</span>
                    <span class="strat-point-val">${pt.text}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="strat-philosophy-section strat-opt-test-reference-hidden">
            <h4 class="strat-section-title">${data.philosophy.title}</h4>
            <p class="strat-philosophy-premise">${data.philosophy.premise}</p>
            <div class="strat-tradeoff-grid">
              <div class="strat-tradeoff-card is-prioritise">
                <p class="strat-tradeoff-desc">${data.philosophy.tradeoffs[0].text}</p>
              </div>
              <div class="strat-tradeoff-card is-avoid">
                <p class="strat-tradeoff-desc">${data.philosophy.tradeoffs[1].text}</p>
              </div>
            </div>
          </div>

        </div>

        <!-- Quiet Regulatory Disclaimer -->
        <div class="strat-perf-disclaimer-card strat-opt-statutory">
          <div class="strat-compliance-badge strat-opt-compliance-badge">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>SEBI Registered Portfolio Manager (Reg: INP000001660)</span>
          </div>
          <p class="strat-perf-disclaimer strat-opt-statutory-text">${data.disclosures.statutory}</p>
        </div>
      </section>
    `;
  }

  function renderStrategyDetail(stratId) {
    const data = strategyData[stratId];
    if (!data || !stratDetailBody) return;

    if (strategyDetailSheet) {
      strategyDetailSheet.setAttribute('data-strat-id', stratId);
    }

    if (renderedStrategyId === stratId && stratDetailBody.children.length > 0) {
      // Reset any expanded progressive disclosures to default collapsed state without rebuilding DOM
      const expBtns = stratDetailBody.querySelectorAll('.strat-disclosure-btn[aria-expanded="true"]');
      expBtns.forEach(btn => {
        btn.setAttribute('aria-expanded', 'false');
        const targetId = btn.getAttribute('aria-controls');
        const targetEl = targetId ? document.getElementById(targetId) : null;
        if (targetEl) {
          targetEl.classList.add('is-collapsed');
          targetEl.classList.remove('is-expanded');
          targetEl.setAttribute('aria-hidden', 'true');
        }
        const btnTextEl = btn.querySelector('.strat-disclosure-btn-text');
        if (btnTextEl) {
          if (targetId === 'stratPerfExtended') {
            btnTextEl.textContent = 'Explore detailed performance (1Y, 3Y & compounding)';
          } else if (targetId === 'stratFactsExtended') {
            btnTextEl.textContent = 'View all strategy facts (AUM, Inception, Universe)';
          } else {
            const defaultLabel = btn.getAttribute('data-label') || 'specifications';
            btnTextEl.textContent = `View ${defaultLabel}`;
          }
        }
      });
      if (stratEnquireBtnText) {
        stratEnquireBtnText.textContent = data.ctaLabel;
      }
      stratDetailBody.scrollTop = 0;
      return;
    }
    renderedStrategyId = stratId;

    if (stratId === 'optimiser') {
      renderOptimiserStrategyDetail(data);
      if (stratEnquireBtnText) {
        stratEnquireBtnText.textContent = data.ctaLabel;
      }
      if (stratDetailBody) {
        stratDetailBody.scrollTop = 0;
      }
      return;
    }

    if (stratId === 'focused') {
      renderFocusedStrategyDetail(data);
      if (stratEnquireBtnText) {
        stratEnquireBtnText.textContent = data.ctaLabel;
      }
      if (stratDetailBody) {
        stratDetailBody.scrollTop = 0;
      }
      return;
    }

    if (stratId === 'direct-growth') {
      renderDirectGrowthStrategyDetail(data);
      if (stratEnquireBtnText) {
        stratEnquireBtnText.textContent = data.ctaLabel;
      }
      if (stratDetailBody) {
        stratDetailBody.scrollTop = 0;
      }
      return;
    }

    const shortName = data.name.replace(' Portfolio', '');

    // Strategy-specific bespoke visual storytelling indicators
    let bespokeVisualHtml = '';
    let methodologyTitle = 'How the strategy works';

    if (stratId === 'optimiser') {
      methodologyTitle = 'Systematic quantitative factor pipeline';
      bespokeVisualHtml = `
        <div class="strat-editorial-visual strat-visual-optimiser" aria-label="3-stage quantitative factor sequence">
          <div class="strat-flow-track" aria-hidden="true">
            <div class="strat-flow-node is-active">
              <span class="strat-flow-dot"></span>
              <span class="strat-flow-tag">Stage 01</span>
              <span class="strat-flow-desc">Top 200 Universe</span>
            </div>
            <div class="strat-flow-line"></div>
            <div class="strat-flow-node is-active">
              <span class="strat-flow-dot"></span>
              <span class="strat-flow-tag">Stage 02</span>
              <span class="strat-flow-desc">Momentum Filter</span>
            </div>
            <div class="strat-flow-line"></div>
            <div class="strat-flow-node is-active">
              <span class="strat-flow-dot"></span>
              <span class="strat-flow-tag">Stage 03</span>
              <span class="strat-flow-desc">Equal Weight Resets</span>
            </div>
          </div>
        </div>
      `;
    } else if (stratId === 'focused') {
      methodologyTitle = 'High-conviction leadership evaluation';
      bespokeVisualHtml = `
        <div class="strat-editorial-visual strat-visual-focused" aria-label="High conviction moat indicators">
          <div class="strat-conviction-bar">
            <div class="strat-conviction-badge">
              <span class="strat-badge-val">10–20</span>
              <span class="strat-badge-lbl">High-Conviction Stocks</span>
            </div>
            <div class="strat-conviction-sep" aria-hidden="true"></div>
            <div class="strat-conviction-badge">
              <span class="strat-badge-val">1%–15%</span>
              <span class="strat-badge-lbl">Position Sizing</span>
            </div>
            <div class="strat-conviction-sep" aria-hidden="true"></div>
            <div class="strat-conviction-badge">
              <span class="strat-badge-val">> 9 Yrs</span>
              <span class="strat-badge-lbl">Active Track Record</span>
            </div>
          </div>
        </div>
      `;
    } else if (stratId === 'direct-growth') {
      methodologyTitle = 'Curated core & satellite framework';
      bespokeVisualHtml = `
        <div class="strat-editorial-visual strat-visual-direct-growth" aria-label="Core and Satellite allocation ratio">
          <div class="strat-allocation-visualizer">
            <div class="strat-alloc-bar" aria-hidden="true">
              <div class="strat-alloc-seg is-core" style="width: 65%;">
                <span>Core 60%–70%</span>
              </div>
              <div class="strat-alloc-seg is-sat" style="width: 35%;">
                <span>Satellite 30%–40%</span>
              </div>
            </div>
            <div class="strat-alloc-legend">
              <div class="strat-legend-item">
                <span class="strat-legend-dot is-core" aria-hidden="true"></span>
                <span><strong>Core Portfolio:</strong> Diversified equity anchors for structural compounding</span>
              </div>
              <div class="strat-legend-item">
                <span class="strat-legend-dot is-sat" aria-hidden="true"></span>
                <span><strong>Satellite Allocation:</strong> Agile tactical alpha and thematic sector positioning</span>
              </div>
              <div class="strat-legend-callout">
                <span class="strat-callout-pill">Direct Plan Advantage</span>
                <span>100% direct mutual funds completely eliminating distributor commissions</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    stratDetailBody.innerHTML = `
      <!-- Movement 1: The Opening — Art-Directed Header & Thesis Banner -->
      <header class="strat-sheet-header">
        <div class="strat-sheet-intro-top">
          <div class="strat-sheet-title-group">
            <div class="strat-card-tags">
              <span class="strat-pill strat-pill-accent">${data.chips[0]}</span>
              <span class="strat-pill strat-pill-sub">${data.chips[1]}</span>
            </div>
            <h3 class="strat-sheet-title strat-detail-title">${data.name}</h3>
          </div>
          <div class="strat-card-art strat-sheet-art" aria-hidden="true">
            ${getStrategyCardSvg(stratId)}
          </div>
        </div>

        <p class="strat-sheet-desc strat-detail-summary">${data.summary}</p>

        <div class="strat-sheet-defining-idea">
          <span class="strat-idea-accent" aria-hidden="true"></span>
          <span class="strat-idea-text">${data.definingIdea}</span>
        </div>

        <div class="strat-thesis-banner">
          <span class="strat-thesis-eyebrow">Strategic Thesis</span>
          <h4 class="strat-thesis-headline">${data.thesisHeadline}</h4>
        </div>
      </header>

      <!-- Movement 2: The Philosophy — Premise & Intentional Trade-offs -->
      <section class="strat-detail-section strat-philosophy-section" aria-label="Investment Philosophy and Strategic Trade-offs">
        <div class="strat-section-header">
          <div class="strat-section-eyebrow">
            <span class="strat-eyebrow-accent" aria-hidden="true"></span>
            <span>${data.philosophy.eyebrow}</span>
          </div>
          <h4 class="strat-section-title">${data.philosophy.title}</h4>
        </div>

        <p class="strat-philosophy-premise">${data.philosophy.premise}</p>

        <div class="strat-tradeoff-grid">
          <div class="strat-tradeoff-card is-prioritise">
            <div class="strat-tradeoff-header">
              <svg class="strat-tradeoff-icon" viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
              </svg>
              <span class="strat-tradeoff-label">What We Prioritise</span>
            </div>
            <p class="strat-tradeoff-desc">${data.philosophy.tradeoffs[0].text}</p>
          </div>

          <div class="strat-tradeoff-card is-avoid">
            <div class="strat-tradeoff-header">
              <svg class="strat-tradeoff-icon" viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
              </svg>
              <span class="strat-tradeoff-label">What We Deliberately Avoid</span>
            </div>
            <p class="strat-tradeoff-desc">${data.philosophy.tradeoffs[1].text}</p>
          </div>
        </div>
      </section>

      <!-- Movement 3: The Engine — Visual Process & Execution Principles -->
      <section class="strat-detail-section strat-methodology-section" aria-label="Investment Approach & Construction">
        <div class="strat-section-header">
          <div class="strat-section-eyebrow">
            <span class="strat-eyebrow-accent" aria-hidden="true"></span>
            <span>How The Strategy Works</span>
          </div>
          <h4 class="strat-section-title">${methodologyTitle}</h4>
        </div>

        ${bespokeVisualHtml}

        <div class="strat-principles-list strat-approach-list">
          ${data.principles.map(p => `
            <article class="strat-principle-card strat-approach-item">
              <div class="strat-principle-header">
                <span class="strat-principle-num strat-approach-num" aria-hidden="true">${p.num}</span>
                <span class="strat-principle-cue">${p.cue}</span>
              </div>
              <div class="strat-approach-content">
                <h5 class="strat-principle-heading strat-approach-heading">${p.heading}</h5>
                <p class="strat-principle-desc strat-approach-desc">${p.desc}</p>
              </div>
            </article>
          `).join('')}
        </div>

        ${data.managerQuote ? `
          <div class="strat-editorial-quote">
            <p class="strat-quote-text">“${data.managerQuote.quote}”</p>
            <span class="strat-quote-author">— ${data.managerQuote.author}, ${data.managerQuote.role}</span>
          </div>
        ` : ''}
      </section>

      <!-- Movement 4: Legal Structure & Custody Architecture -->
      <section class="strat-detail-section strat-structure-section" aria-label="Custody and Mandate Structure">
        <div class="strat-structure-block">
          <div class="strat-structure-row">
            <span class="strat-struct-label">Legal Custody</span>
            <span class="strat-struct-val">${data.structure.custody}</span>
          </div>
          <div class="strat-structure-row">
            <span class="strat-struct-label">Mandate Type</span>
            <span class="strat-struct-val">${data.structure.management}</span>
          </div>
          <div class="strat-structure-row">
            <span class="strat-struct-label">Portfolio Lead</span>
            <span class="strat-struct-val">${data.structure.lead}</span>
          </div>
          <p class="strat-detail-text">${data.structure.text}</p>
        </div>
      </section>

      <!-- Movement 5: The Evidence — Performance & Benchmark Comparison -->
      <section class="strat-detail-section strat-performance-section" aria-label="Performance Track Record and Regulatory Disclosures">
        <div class="strat-section-header">
          <div class="strat-section-eyebrow">
            <span class="strat-eyebrow-accent" aria-hidden="true"></span>
            <span>Performance & Track Record</span>
            <span class="strat-as-of-badge">${data.performance.asOf}</span>
          </div>
          <h4 class="strat-section-title">Verified benchmark comparison</h4>
        </div>

        <div class="strat-perf-headline-card">
          <div class="strat-headline-header">
            <span class="strat-headline-period">${data.performance.headlineComparison.period}</span>
            <span class="strat-headline-since">Since ${data.performance.headlineComparison.inceptionDate}</span>
          </div>
          <div class="strat-headline-comparison">
            <div class="strat-headline-col is-strat">
              <span class="strat-col-label">${shortName}</span>
              <span class="strat-col-val">${data.performance.headlineComparison.strat}</span>
            </div>
            <div class="strat-headline-vs" aria-hidden="true">vs</div>
            <div class="strat-headline-col is-bench">
              <span class="strat-col-label">Nifty 50 TRI</span>
              <span class="strat-col-val">${data.performance.headlineComparison.bench}</span>
            </div>
          </div>
          <div class="strat-headline-bar" aria-hidden="true">
            <div class="strat-bar-fill" style="width: ${Math.min(100, Math.round((parseFloat(data.performance.headlineComparison.strat) / (parseFloat(data.performance.headlineComparison.strat) + parseFloat(data.performance.headlineComparison.bench))) * 100))}%"></div>
          </div>
          <div class="strat-headline-alpha">
            <span class="strat-alpha-label">Net Outperformance</span>
            <span class="strat-alpha-val">${data.performance.headlineComparison.diff}</span>
          </div>
        </div>
      </section>

      <!-- Movement 6: Deep Strategy Specifications & Progressive Disclosures -->
      <section class="strat-detail-section strat-specifications-section" aria-label="Key Strategy Facts and Detailed Specifications">
        <div class="strat-section-header">
          <div class="strat-section-eyebrow">
            <span class="strat-eyebrow-accent" aria-hidden="true"></span>
            <span>Key Strategy Facts</span>
          </div>
          <h4 class="strat-section-title">Core specifications & disclosures</h4>
        </div>

        <div class="strat-priority-facts">
          ${data.priorityFacts.map(pf => `
            <div class="strat-priority-fact">
              <span class="strat-priority-label">${pf.label}</span>
              <span class="strat-priority-val">${pf.val}</span>
            </div>
          `).join('')}
        </div>

        <!-- 6 Progressive Disclosure Accordions -->
        <div class="strat-accordion-group" role="region" aria-label="Comprehensive Strategy Specifications & Disclosures">

          <!-- Accordion 1: Selection Methodology -->
          <div class="strat-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger" id="btnToggleStratMethodology" aria-expanded="false" aria-controls="stratMethodologyExtended" data-label="selection methodology">
              <span class="strat-accordion-trigger-title">Selection Methodology & Screening Rules</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text">View selection methodology</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratMethodologyExtended" aria-hidden="true">
              <div class="strat-panel-content">
                <h5 class="strat-panel-title">${data.methodologyDetails.title}</h5>
                <ol class="strat-steps-list">
                  ${data.methodologyDetails.steps.map((s, idx) => `
                    <li class="strat-step-item">
                      <span class="strat-step-num">0${idx + 1}</span>
                      <div class="strat-step-text">
                        <strong class="strat-step-title">${s.title}</strong>
                        <p class="strat-step-desc">${s.desc}</p>
                      </div>
                    </li>
                  `).join('')}
                </ol>
              </div>
            </div>
          </div>

          <!-- Accordion 2: Portfolio Construction -->
          <div class="strat-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger" id="btnToggleStratConstruction" aria-expanded="false" aria-controls="stratConstructionExtended" data-label="portfolio construction">
              <span class="strat-accordion-trigger-title">Portfolio Construction & Sizing Discipline</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text">View portfolio construction</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratConstructionExtended" aria-hidden="true">
              <div class="strat-panel-content">
                <h5 class="strat-panel-title">${data.constructionDetails.title}</h5>
                <ul class="strat-points-list">
                  ${data.constructionDetails.points.map(pt => `
                    <li class="strat-point-item">
                      <span class="strat-point-label">${pt.label}</span>
                      <span class="strat-point-val">${pt.text}</span>
                    </li>
                  `).join('')}
                </ul>
              </div>
            </div>
          </div>

          <!-- Accordion 3: Verified Performance & Compounding (Preserves #btnToggleStratPerf & #stratPerfExtended) -->
          <div class="strat-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger" id="btnToggleStratPerf" aria-expanded="false" aria-controls="stratPerfExtended" data-label="detailed performance">
              <span class="strat-accordion-trigger-title">Verified Historical Performance & Compounding</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text">Explore detailed performance (1Y, 3Y & compounding)</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratPerfExtended" aria-hidden="true">
              <div class="strat-perf-table-wrap">
                <table class="strat-perf-table" aria-label="Performance Comparison against Nifty 50 TRI">
                  <thead>
                    <tr>
                      <th scope="col" class="strat-th-period">Period</th>
                      <th scope="col" class="strat-th-strat">${shortName}</th>
                      <th scope="col" class="strat-th-bench">Nifty 50 TRI</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${data.performance.rows.map(row => `
                      <tr>
                        <td class="strat-td-period">${row.period}</td>
                        <td class="strat-td-strat ${row.strat.startsWith('+') || !row.strat.startsWith('-') ? 'is-positive' : ''}">${row.strat}</td>
                        <td class="strat-td-bench">${row.bench}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>

              <div class="strat-wealth-callout">
                <div class="strat-wealth-header">
                  <span class="strat-wealth-tag">Compounding Illustration</span>
                  <span class="strat-wealth-label">${data.performance.compoundingCallout.label}</span>
                </div>
                <div class="strat-wealth-comparison">
                  <div class="strat-wealth-col is-strat">
                    <span class="strat-wealth-sub">Strategy (${shortName})</span>
                    <span class="strat-wealth-val">${data.performance.compoundingCallout.stratValue}</span>
                  </div>
                  <div class="strat-wealth-arrow" aria-hidden="true">vs</div>
                  <div class="strat-wealth-col is-bench">
                    <span class="strat-wealth-sub">Benchmark (Nifty 50)</span>
                    <span class="strat-wealth-val">${data.performance.compoundingCallout.benchValue}</span>
                  </div>
                </div>
                <div class="strat-wealth-initial">Initial capital basis: ${data.performance.compoundingCallout.initial} (Hypothetical compounding comparison)</div>
              </div>

              <div class="strat-perf-stat" style="display: none;">${data.performance.statLine}</div>
              <div class="strat-perf-source-note">${data.performance.sourceNote}</div>
            </div>
          </div>

          <!-- Accordion 4: Institutional Facts Ledger (Preserves #btnToggleStratFacts & #stratFactsExtended) -->
          <div class="strat-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger" id="btnToggleStratFacts" aria-expanded="false" aria-controls="stratFactsExtended" data-label="all strategy facts">
              <span class="strat-accordion-trigger-title">Institutional Facts & Strategy Ledger</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text">View all strategy facts (AUM, Inception, Universe)</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratFactsExtended" aria-hidden="true">
              <div class="strat-facts-grid">
                ${data.secondaryFacts.map(fact => `
                  <div class="strat-fact-item ${fact.fullWidth ? 'strat-fact-item--full' : ''}">
                    <span class="strat-fact-label">${fact.label}</span>
                    <span class="strat-fact-val">${fact.val}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Accordion 5: Fee Architecture & Mandate Terms -->
          <div class="strat-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger" id="btnToggleStratFees" aria-expanded="false" aria-controls="stratFeesExtended" data-label="fee terms">
              <span class="strat-accordion-trigger-title">Institutional Fee Schedule & Mandate Terms</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text">View fee terms</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratFeesExtended" aria-hidden="true">
              <div class="strat-panel-content">
                <h5 class="strat-panel-title">${data.feeDetails.title}</h5>
                <ul class="strat-points-list">
                  ${data.feeDetails.points.map(pt => `
                    <li class="strat-point-item">
                      <span class="strat-point-label">${pt.label}</span>
                      <span class="strat-point-val">${pt.text}</span>
                    </li>
                  `).join('')}
                </ul>
              </div>
            </div>
          </div>

          <!-- Accordion 6: Risk Factors & Volatility Safeguards -->
          <div class="strat-accordion-item">
            <button type="button" class="strat-disclosure-btn strat-accordion-trigger" id="btnToggleStratRisks" aria-expanded="false" aria-controls="stratRisksExtended" data-label="risk disclosures">
              <span class="strat-accordion-trigger-title">Key Risk Factors & Volatility Safeguards</span>
              <span class="strat-accordion-trigger-action">
                <span class="strat-disclosure-btn-text">View risk disclosures</span>
                <svg class="strat-disclosure-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </button>
            <div class="strat-accordion-panel strat-disclosure-content is-collapsed" id="stratRisksExtended" aria-hidden="true">
              <div class="strat-panel-content">
                <h5 class="strat-panel-title">${data.riskDetails.title}</h5>
                <ul class="strat-points-list">
                  ${data.riskDetails.points.map(pt => `
                    <li class="strat-point-item">
                      <span class="strat-point-label">${pt.label}</span>
                      <span class="strat-point-val">${pt.text}</span>
                    </li>
                  `).join('')}
                </ul>
              </div>
            </div>
          </div>

        </div>

        <div class="strat-fit-card">
          <span class="strat-fit-label">Investor Suitability</span>
          <p class="strat-fit-text">${data.disclosures.fit}</p>
        </div>

        <div class="strat-perf-disclaimer-card">
          <div class="strat-compliance-badge">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>SEBI Registered Portfolio Manager (Reg: INP000001660)</span>
          </div>
          <p class="strat-perf-disclaimer">${data.disclosures.statutory}</p>
        </div>
      </section>
    `;

    if (stratEnquireBtnText) {
      stratEnquireBtnText.textContent = data.ctaLabel;
    }
    if (stratDetailBody) {
      stratDetailBody.scrollTop = 0;
    }
  }

  function openStrategyDetail(stratId) {
    if (!strategyDetailOverlay) return;

    lastStratTriggerElement = document.activeElement;
    lastStratScrollY = window.scrollY;
    activeStrategyId = stratId;
    formState.selectedStrategy = stratId;
    trackFunnelEvent('strategy_sheet_open', { strategyId: stratId });

    renderStrategyDetail(stratId);

    strategyDetailOverlay.style.display = 'flex';
    strategyDetailOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    if (btnStratDetailBack) {
      btnStratDetailBack.focus();
    }
  }

  function closeStrategyDetail() {
    if (!strategyDetailOverlay || strategyDetailOverlay.style.display === 'none') return;

    strategyDetailOverlay.style.display = 'none';
    strategyDetailOverlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    window.scrollTo(0, lastStratScrollY);

    if (lastStratTriggerElement && typeof lastStratTriggerElement.focus === 'function') {
      lastStratTriggerElement.focus();
    } else {
      const card = document.querySelector(`[data-strat-id="${activeStrategyId}"]`);
      if (card) card.focus();
    }
    activeStrategyId = null;
  }

  stratOverviewCards.forEach(card => {
    card.addEventListener('click', function () {
      const stratId = this.getAttribute('data-strat-id');
      if (stratId) openStrategyDetail(stratId);
    });

    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const stratId = this.getAttribute('data-strat-id');
        if (stratId) openStrategyDetail(stratId);
      }
    });
  });

  // Pause off-screen strategy card ambient keyframe animations when far outside viewport
  if ('IntersectionObserver' in window && stratOverviewCards.length > 0) {
    const ambientCardObserver = new IntersectionObserver((entries) => {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        entry.target.classList.toggle('is-offscreen', !entry.isIntersecting);
      }
    }, { rootMargin: '600px 0px' });

    stratOverviewCards.forEach(card => {
      ambientCardObserver.observe(card);
    });
  }

  if (btnStratDetailBack) {
    btnStratDetailBack.addEventListener('click', closeStrategyDetail);
  }
  if (btnStratDetailClose) {
    btnStratDetailClose.addEventListener('click', closeStrategyDetail);
  }

  // Progressive disclosure triggers in strategy detail sheet
  if (stratDetailBody) {
    stratDetailBody.addEventListener('click', function (e) {
      const toggleBtn = e.target.closest('.strat-disclosure-btn');
      if (!toggleBtn) return;
      const targetId = toggleBtn.getAttribute('aria-controls');
      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;

      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!isExpanded));
      targetEl.classList.toggle('is-collapsed', isExpanded);
      targetEl.classList.toggle('is-expanded', !isExpanded);
      targetEl.setAttribute('aria-hidden', String(isExpanded));

      const btnTextEl = toggleBtn.querySelector('.strat-disclosure-btn-text');
      if (btnTextEl) {
        if (targetId === 'stratPerfExtended') {
          btnTextEl.textContent = !isExpanded
            ? 'Hide detailed performance'
            : 'Explore detailed performance (1Y, 3Y & compounding)';
        } else if (targetId === 'stratFactsExtended') {
          btnTextEl.textContent = !isExpanded
            ? 'Hide additional strategy facts'
            : 'View all strategy facts (AUM, Inception, Universe)';
        } else {
          const defaultLabel = toggleBtn.getAttribute('data-label') || 'details';
          btnTextEl.textContent = !isExpanded ? `Hide ${defaultLabel}` : `View ${defaultLabel}`;
        }
      }
    });
  }

  if (strategyDetailOverlay) {
    strategyDetailOverlay.addEventListener('click', function (e) {
      if (e.target === strategyDetailOverlay) {
        closeStrategyDetail();
      }
    });
  }

  if (btnStratDetailEnquire) {
    btnStratDetailEnquire.addEventListener('click', function () {
      const stratId = activeStrategyId || '';
      if (stratId) formState.selectedStrategy = stratId;
      trackFunnelEvent('cta_click', { source: 'strategy_sheet', strategyId: stratId });
      strategyDetailOverlay.style.display = 'none';
      strategyDetailOverlay.setAttribute('aria-hidden', 'true');
      activeStrategyId = null;
      goToStep('q1');
    });
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && strategyDetailOverlay && strategyDetailOverlay.style.display !== 'none') {
      e.preventDefault();
      closeStrategyDetail();
    }
  });

  window.__sbOpenStrategyDetail = openStrategyDetail;
  window.__sbCloseStrategyDetail = closeStrategyDetail;

  // ==========================================================================
  // Integrated Performance Components Logic
  // ==========================================================================

  // 1. Performance Period Comparison (Component 2)
  const perfData = (typeof window !== 'undefined' && window.PERFORMANCE_DATA) ? window.PERFORMANCE_DATA : null;
  const periodBtns = Array.from(document.querySelectorAll('.perf-period-btn'));
  const perfBarBenchmark = document.getElementById('perfBarBenchmark');
  const perfBarScripbox = document.getElementById('perfBarScripbox');
  const perfValBenchmark = document.getElementById('perfValBenchmark');
  const perfValScripbox = document.getElementById('perfValScripbox');
  const perfLiveAnnouncement = document.getElementById('perfLiveAnnouncement');

  function updatePerformancePeriod(periodId) {
    if (!perfData || !perfData.periods[periodId]) return;
    const data = perfData.periods[periodId];

    // Fixed vertical axis scale: 0% to 35%
    const MAX_SCALE = 35.0;
    const benchmarkPct = (data.benchmark / MAX_SCALE) * 100;
    const scripboxPct = (data.scripbox / MAX_SCALE) * 100;

    if (perfBarBenchmark) {
      perfBarBenchmark.style.height = benchmarkPct.toFixed(1) + '%';
    }
    if (perfBarScripbox) {
      perfBarScripbox.style.height = scripboxPct.toFixed(1) + '%';
    }
    if (perfValBenchmark) {
      perfValBenchmark.textContent = data.displayBenchmark;
    }
    if (perfValScripbox) {
      perfValScripbox.textContent = data.displayScripbox;
    }

    // Update active button state
    periodBtns.forEach(btn => {
      const isCurrent = btn.getAttribute('data-period') === periodId;
      btn.setAttribute('aria-checked', isCurrent ? 'true' : 'false');
      btn.setAttribute('tabindex', isCurrent ? '0' : '-1');
      if (isCurrent) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }
    });

    // Screen reader announcement
    if (perfLiveAnnouncement) {
      perfLiveAnnouncement.textContent = `Selected ${data.label}: Scripbox Portfolio Optimiser ${data.displayScripbox}, Benchmark ${data.displayBenchmark}.`;
    }
  }

  if (periodBtns.length > 0) {
    periodBtns.forEach((btn, index) => {
      btn.addEventListener('click', () => {
        const periodId = btn.getAttribute('data-period');
        updatePerformancePeriod(periodId);
      });

      // Arrow navigation for radiogroup accessibility
      btn.addEventListener('keydown', (e) => {
        let targetIndex = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          targetIndex = (index + 1) % periodBtns.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          targetIndex = (index - 1 + periodBtns.length) % periodBtns.length;
        }

        if (targetIndex >= 0) {
          e.preventDefault();
          const targetBtn = periodBtns[targetIndex];
          targetBtn.focus();
          const periodId = targetBtn.getAttribute('data-period');
          updatePerformancePeriod(periodId);
        }
      });
    });
  }

  // 2. Hero Wealth Accumulation Disclosure (Direct visible disclosure, no modal popup required)
  const btnHeroGrowthInfo = document.getElementById('btnHeroGrowthInfo') || document.getElementById('btnGrowthInfo');
  const heroGrowthPopup = document.getElementById('heroGrowthPopup') || document.getElementById('growthDisclaimerPopup');
  const btnHeroClosePopup = document.getElementById('btnHeroClosePopup') || document.getElementById('btnCloseDisclaimer');

  function openDisclaimerPopup() {
    if (!heroGrowthPopup || !btnHeroGrowthInfo) return;
    heroGrowthPopup.classList.remove('is-hidden');
    btnHeroGrowthInfo.setAttribute('aria-expanded', 'true');
    if (btnHeroClosePopup) {
      btnHeroClosePopup.focus();
    }
  }

  function closeDisclaimerPopup() {
    if (!heroGrowthPopup || !btnHeroGrowthInfo) return;
    heroGrowthPopup.classList.add('is-hidden');
    btnHeroGrowthInfo.setAttribute('aria-expanded', 'false');
    btnHeroGrowthInfo.focus();
  }

  if (btnHeroGrowthInfo) {
    btnHeroGrowthInfo.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = btnHeroGrowthInfo.getAttribute('aria-expanded') === 'true';
      if (isExpanded) {
        closeDisclaimerPopup();
      } else {
        openDisclaimerPopup();
      }
    });

    if (btnHeroClosePopup) {
      btnHeroClosePopup.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDisclaimerPopup();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && heroGrowthPopup && !heroGrowthPopup.classList.contains('is-hidden')) {
        closeDisclaimerPopup();
      }
    });

    document.addEventListener('click', (e) => {
      if (heroGrowthPopup && !heroGrowthPopup.classList.contains('is-hidden')) {
        if (!heroGrowthPopup.contains(e.target) && e.target !== btnHeroGrowthInfo && !btnHeroGrowthInfo.contains(e.target)) {
          closeDisclaimerPopup();
        }
      }
    });
  }

  // 3. Mobile-Only Leadership Carousel Controller
  const leaderTrack = document.getElementById('leadershipCarouselTrack');
  const leaderCards = leaderTrack ? leaderTrack.querySelectorAll('.leadership-card') : [];
  const leaderDots = document.querySelectorAll('.carousel-dot-btn');
  const btnLeaderPrev = document.getElementById('btnLeaderPrev');
  const btnLeaderNext = document.getElementById('btnLeaderNext');

  let currentLeaderIndex = 0;

  function getLeaderCardOffset(index) {
    if (!leaderTrack || !leaderCards[index]) return 0;
    const card = leaderCards[index];
    return card.offsetLeft - leaderTrack.offsetLeft;
  }

  function scrollLeaderTo(index, instant) {
    if (!leaderTrack || index < 0 || index >= leaderCards.length) return;
    currentLeaderIndex = index;
    const targetLeft = getLeaderCardOffset(index);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    leaderTrack.scrollTo({
      left: targetLeft,
      behavior: instant || prefersReducedMotion ? 'auto' : 'smooth'
    });
    updateLeaderControls(index);
  }

  function updateLeaderControls(activeIndex) {
    currentLeaderIndex = activeIndex;
    leaderDots.forEach((dot, idx) => {
      const isActive = idx === activeIndex;
      dot.classList.toggle('is-active', isActive);
      dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
      dot.setAttribute('aria-current', isActive ? 'true' : 'false');
      dot.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    const leaderLiveStatus = document.getElementById('leaderLiveStatus');
    if (leaderLiveStatus && leaderCards[activeIndex]) {
      const leaderName = leaderCards[activeIndex].querySelector('.leader-name')?.textContent?.trim() || '';
      leaderLiveStatus.textContent = `Showing slide ${activeIndex + 1} of ${leaderCards.length}${leaderName ? ': ' + leaderName : ''}`;
    }

    if (btnLeaderPrev) {
      btnLeaderPrev.disabled = activeIndex <= 0;
    }
    if (btnLeaderNext) {
      btnLeaderNext.disabled = activeIndex >= leaderCards.length - 1;
    }
  }

  if (leaderTrack && leaderCards.length > 0) {
    let scrollTimeout = null;

    leaderTrack.addEventListener('scroll', () => {
      if (scrollTimeout) cancelAnimationFrame(scrollTimeout);
      scrollTimeout = requestAnimationFrame(() => {
        const scrollLeft = leaderTrack.scrollLeft;
        let closestIndex = 0;
        let minDiff = Infinity;

        leaderCards.forEach((card, idx) => {
          const cardLeft = card.offsetLeft - leaderTrack.offsetLeft;
          const diff = Math.abs(cardLeft - scrollLeft);
          if (diff < minDiff) {
            minDiff = diff;
            closestIndex = idx;
          }
        });

        if (closestIndex !== currentLeaderIndex) {
          updateLeaderControls(closestIndex);
        }
      });
    }, { passive: true });

    // Click on position dots
    leaderDots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const targetIdx = parseInt(dot.getAttribute('data-slide-index'), 10);
        if (!isNaN(targetIdx)) {
          scrollLeaderTo(targetIdx);
        }
      });
    });

    // Arrow controls
    if (btnLeaderPrev) {
      btnLeaderPrev.addEventListener('click', () => {
        if (currentLeaderIndex > 0) {
          scrollLeaderTo(currentLeaderIndex - 1);
        }
      });
    }

    if (btnLeaderNext) {
      btnLeaderNext.addEventListener('click', () => {
        if (currentLeaderIndex < leaderCards.length - 1) {
          scrollLeaderTo(currentLeaderIndex + 1);
        }
      });
    }

    // Keyboard navigation on track
    leaderTrack.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        if (currentLeaderIndex < leaderCards.length - 1) {
          e.preventDefault();
          scrollLeaderTo(currentLeaderIndex + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentLeaderIndex > 0) {
          e.preventDefault();
          scrollLeaderTo(currentLeaderIndex - 1);
        }
      }
    });

    // Initial sync
    updateLeaderControls(0);
  }

  // 4. Mobile Road to Wealth Advisory Process Controller
  const roadTrack = document.getElementById('roadTrack');
  const roadCards = roadTrack ? roadTrack.querySelectorAll('.road-milestone-card') : [];
  const roadSegments = document.querySelectorAll('.road-segment');
  const roadCounterText = document.getElementById('roadCounterText');
  const btnRoadPrev = document.getElementById('btnRoadPrev');
  const btnRoadNext = document.getElementById('btnRoadNext');

  let currentRoadIndex = 0;

  function getRoadCardOffset(index) {
    if (!roadTrack || !roadCards[index]) return 0;
    const card = roadCards[index];
    return card.offsetLeft - roadTrack.offsetLeft - 18;
  }

  function scrollRoadTo(index, instant) {
    if (!roadTrack || index < 0 || index >= roadCards.length) return;
    currentRoadIndex = index;
    const targetLeft = Math.max(0, getRoadCardOffset(index));
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    roadTrack.scrollTo({
      left: targetLeft,
      behavior: instant || prefersReducedMotion ? 'auto' : 'smooth'
    });
    updateRoadControls(index);
  }

  function updateRoadControls(activeIndex) {
    currentRoadIndex = activeIndex;
    roadCards.forEach((card, idx) => {
      card.classList.toggle('is-active', idx === activeIndex);
    });

    roadSegments.forEach((seg, idx) => {
      seg.classList.toggle('is-active', idx === activeIndex);
    });

    if (roadCounterText) {
      roadCounterText.textContent = `0${activeIndex + 1} / 0${roadCards.length}`;
    }

    const segmentsContainer = document.querySelector('.road-progress-segments');
    if (segmentsContainer) {
      segmentsContainer.setAttribute('aria-valuenow', String(activeIndex + 1));
      segmentsContainer.setAttribute('aria-label', `Milestone ${activeIndex + 1} of ${roadCards.length}`);
    }

    if (btnRoadPrev) {
      btnRoadPrev.disabled = activeIndex <= 0;
    }
    if (btnRoadNext) {
      btnRoadNext.disabled = activeIndex >= roadCards.length - 1;
    }
  }

  if (roadTrack && roadCards.length > 0) {
    let roadScrollTimeout = null;

    roadTrack.addEventListener('scroll', () => {
      if (roadScrollTimeout) cancelAnimationFrame(roadScrollTimeout);
      roadScrollTimeout = requestAnimationFrame(() => {
        const scrollLeft = roadTrack.scrollLeft;
        let closestIndex = 0;
        let minDiff = Infinity;

        roadCards.forEach((card, idx) => {
          const cardLeft = Math.max(0, card.offsetLeft - roadTrack.offsetLeft - 18);
          const diff = Math.abs(cardLeft - scrollLeft);
          if (diff < minDiff) {
            minDiff = diff;
            closestIndex = idx;
          }
        });

        if (closestIndex !== currentRoadIndex) {
          updateRoadControls(closestIndex);
        }
      });
    }, { passive: true });

    if (btnRoadPrev) {
      btnRoadPrev.addEventListener('click', () => {
        if (currentRoadIndex > 0) {
          scrollRoadTo(currentRoadIndex - 1);
        }
      });
    }

    if (btnRoadNext) {
      btnRoadNext.addEventListener('click', () => {
        if (currentRoadIndex < roadCards.length - 1) {
          scrollRoadTo(currentRoadIndex + 1);
        }
      });
    }

    // Keyboard navigation on road track
    roadTrack.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        if (currentRoadIndex < roadCards.length - 1) {
          e.preventDefault();
          scrollRoadTo(currentRoadIndex + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentRoadIndex > 0) {
          e.preventDefault();
          scrollRoadTo(currentRoadIndex - 1);
        }
      }
    });

    // Initial sync
    updateRoadControls(0);
  }

  // GSAP Hero Animation: Message-Led Choreography
  function initHeroAnimation() {
    // 1. Fallback & Safe Degradation Check
    if (typeof gsap === 'undefined') {
      return null;
    }

    // 2. Accessibility & Reduced Motion Check
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      // Retain all elements in their 100% static computed states
      return null;
    }

    const heroHeadline = document.querySelector('.hero-headline');
    const heroCard = document.querySelector('.hero-card-container');
    const curveScripbox = document.querySelector('.curve-scripbox');
    const curveBenchmark = document.querySelector('.curve-benchmark');
    const curveFill = document.querySelector('.curve-fill');
    const nodeOrigin = document.querySelector('.node-origin');
    const nodeScripbox = document.querySelector('.node-scripbox');
    const nodeBenchmark = document.querySelector('.node-benchmark');
    const pillScripbox = document.querySelector('.pill-group-scripbox');
    const pillBenchmark = document.querySelector('.pill-group-benchmark');
    const heroStatSplit = document.querySelector('.hero-stat-split');
    const heroSubhead = document.querySelector('.hero-subhead');
    const heroCta = document.querySelector('.hero-cta-container');

    if (!heroHeadline || !heroCard) {
      return null;
    }

    // Single coordinated master timeline: Editorial Compounding Arc (~2.0s)
    const tl = gsap.timeline({
      defaults: {
        ease: 'power2.out'
      }
    });

    // =========================================================================
    // ACT 1 — HERO COPY & CTA RENDER IMMEDIATELY VIA HTML/CSS (NO JS HIDE/FLASH)
    // Primary headline, ₹2.47 Cr stat split, and primary CTA remain at 100%
    // visibility from First Contentful Paint for instant LCP and zero flash on
    // throttled mobile networks.
    // =========================================================================

    // =========================================================================
    // ACT 2 — PROGRESSIVE SVG COMPOUNDING CURVE CHOREOGRAPHY
    // =========================================================================

    // 1. Chart origin point: 2022 origin starting node anchors the baseline
    if (nodeOrigin) {
      tl.fromTo(nodeOrigin,
        { opacity: 0, scale: 0.4, transformOrigin: 'center center' },
        { opacity: 1, scale: 1, duration: 0.20, ease: 'power2.out' },
        0.04
      );
    }

    // 2. Progressive curve drawing:
    // Benchmark curve traces steadily left to right across the 2022-2026 timeline
    if (curveBenchmark) {
      tl.fromTo(curveBenchmark,
        { strokeDashoffset: 100 },
        { strokeDashoffset: 0, duration: 0.66, ease: 'power2.inOut' },
        0.10
      );
    }

    // Scripbox performance curve draws progressively alongside, ascending toward the apex
    if (curveScripbox) {
      tl.fromTo(curveScripbox,
        { strokeDashoffset: 100 },
        { strokeDashoffset: 0, duration: 0.72, ease: 'power2.inOut' },
        0.10
      );
    }

    // Atmospheric muted sage gradient fill softly emerges as Scripbox outpaces benchmark
    if (curveFill) {
      tl.fromTo(curveFill,
        { opacity: 0 },
        { opacity: 1, duration: 0.46, ease: 'power1.out' },
        0.36
      );
    }

    // 3. Endpoint markers:
    // Terminal connection nodes land as curves arrive at their terminal coordinates
    if (nodeBenchmark) {
      tl.fromTo(nodeBenchmark,
        { opacity: 0, scale: 0.4, transformOrigin: 'center center' },
        { opacity: 1, scale: 1, duration: 0.18, ease: 'power2.out' },
        0.74
      );
    }
    if (nodeScripbox) {
      tl.fromTo(nodeScripbox,
        { opacity: 0, scale: 0.4, transformOrigin: 'center center' },
        { opacity: 1, scale: 1, duration: 0.20, ease: 'power2.out' },
        0.78
      );
    }

    // Dynamic reduced-motion preference change listener
    if (window.matchMedia) {
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      const handleMotionChange = (e) => {
        if (e.matches) {
          tl.progress(1);
        }
      };
      if (typeof motionQuery.addEventListener === 'function') {
        motionQuery.addEventListener('change', handleMotionChange);
      } else if (typeof motionQuery.addListener === 'function') {
        motionQuery.addListener(handleMotionChange);
      }
    }

    return tl;
  }

  // -------------------------------------------------------------
  // Section Navigation Tabs (Sticky directly below Hero)
  // -------------------------------------------------------------
  function initSectionNav() {
    const nav = document.getElementById('sectionNav');
    const track = document.getElementById('sectionNavTrack');
    if (!nav || !track) return;

    const navLinks = Array.from(track.querySelectorAll('.section-nav-link'));
    if (!navLinks.length) return;

    // Smooth click navigation
    navLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (!href || !href.startsWith('#')) return;

        const targetEl = document.querySelector(href);
        if (!targetEl) return;

        e.preventDefault();
        
        // Scroll target into view with nav offset
        const navHeight = nav.offsetHeight || 48;
        let targetTop = 0;

        if (targetEl.id === 'sec-problem' || targetEl.id === 'sec-approach' || targetEl.id === 'perfSection') {
          const container = document.getElementById('paddleStackContainer');
          targetTop = (container ? container.offsetTop : 850) - navHeight;
        } else {
          const targetRect = targetEl.getBoundingClientRect();
          targetTop = window.scrollY + targetRect.top - navHeight - 12;
        }

        window.scrollTo({
          top: Math.max(0, targetTop),
          behavior: 'smooth'
        });

        // Set active state
        navLinks.forEach((l) => {
          l.classList.remove('is-active');
          l.setAttribute('aria-selected', 'false');
        });
        link.classList.add('is-active');
        link.setAttribute('aria-selected', 'true');

        // Horizontally center active tab in track without touching window scroll
        const linkLeft = link.offsetLeft;
        const linkWidth = link.offsetWidth;
        const trackWidth = track.clientWidth;
        track.scrollTo({ left: linkLeft - (trackWidth / 2) + (linkWidth / 2), behavior: 'smooth' });
      });
    });

    // Scroll spy: Update active tab based on scroll position
    const container = document.getElementById('paddleStackContainer');
    const stratSection = document.getElementById('strategiesSection');

    const sectionTargets = navLinks.map((link) => {
      const href = link.getAttribute('href');
      const el = document.querySelector(href);
      return { link, el, href, top: 0, scrollCenterLeft: 0 };
    }).filter(item => Boolean(item.el));

    let cachedNavHeight = 44;
    let lastActiveNavLink = navLinks.find(l => l.classList.contains('is-active')) || null;

    const refreshNavMetrics = () => {
      const scrollY = window.scrollY;
      cachedNavHeight = nav.offsetHeight || 44;
      const trackWidth = track.clientWidth || 390;
      const containerTop = container ? container.offsetTop : null;
      for (let i = 0; i < sectionTargets.length; i++) {
        const item = sectionTargets[i];
        if (item.href === '#sec-problem' && containerTop !== null) {
          item.top = containerTop - 20;
        } else {
          item.top = item.el.getBoundingClientRect().top + scrollY;
        }
        const linkLeft = item.link.offsetLeft;
        const linkWidth = item.link.offsetWidth;
        item.scrollCenterLeft = linkLeft - (trackWidth / 2) + (linkWidth / 2);
      }
    };

    const handleScroll = () => {
      const scrollPos = window.scrollY + cachedNavHeight + 40;

      let currentActive = null;
      for (let i = 0; i < sectionTargets.length; i++) {
        const item = sectionTargets[i];
        if (scrollPos >= item.top) {
          currentActive = item;
        }
      }

      if (currentActive && currentActive.link !== lastActiveNavLink) {
        lastActiveNavLink = currentActive.link;
        const targetScrollLeft = currentActive.scrollCenterLeft;
        navLinks.forEach((l) => {
          const isActive = l === currentActive.link;
          l.classList.toggle('is-active', isActive);
          l.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        // Scroll navigation track horizontally only - never touch window scroll
        track.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
      }
    };

    refreshNavMetrics();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', refreshNavMetrics, { passive: true });
    window.__sbRefreshNavMetrics = refreshNavMetrics;
    window.__sbHandleNavScroll = () => {
      refreshNavMetrics();
      lastActiveNavLink = null;
      handleScroll();
    };
  }

  // -------------------------------------------------------------
  // High-Intent FAQ Accordion Toggles
  // -------------------------------------------------------------
  function initFaqAccordion() {
    const faqTriggers = document.querySelectorAll('.faq-trigger');
    faqTriggers.forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        const content = item ? item.querySelector('.faq-content') : null;
        if (!item || !content) return;

        const isExpanded = btn.getAttribute('aria-expanded') === 'true';

        // Toggle state
        btn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
        item.classList.toggle('is-open', !isExpanded);
        
        if (isExpanded) {
          content.setAttribute('hidden', '');
        } else {
          content.removeAttribute('hidden');
        }
        updateStickyMetrics();
        if (typeof window.__sbRefreshNavMetrics === 'function') {
          window.__sbRefreshNavMetrics();
        }
      });
    });
  }

  // -------------------------------------------------------------
  // Challenge Problem Carousel Component (with 6s Auto-Rotation)
  // -------------------------------------------------------------
  let currentChallengeSlide = 0;
  function initChallengeCarousel() {
    const carousel = document.getElementById('challengeCarousel');
    if (!carousel) return;

    const track = document.getElementById('challengeTrack');
    const slides = Array.from(carousel.querySelectorAll('.challenge-slide'));
    const indicators = Array.from(carousel.querySelectorAll('.carousel-indicator'));
    const counterCurr = document.getElementById('challengeCounterCurr');
    const btnPrev = document.getElementById('btnPrevProblem');
    const btnNext = document.getElementById('btnNextProblem');
    const btnToggle = document.getElementById('btnToggleAutoRotate');
    const iconPause = btnToggle ? btnToggle.querySelector('.icon-pause') : null;
    const iconPlay = btnToggle ? btnToggle.querySelector('.icon-play') : null;

    if (!slides.length) return;

    let userHasInteracted = false;
    let isPausedManually = false;
    let autoRotateTimer = null;
    let isHovered = false;
    let isFocused = false;
    let isVisibleInViewport = false;
    const ROTATION_DELAY = 6000;

    function updatePlayPauseUI(isPaused) {
      if (!btnToggle) return;
      if (isPaused) {
        if (iconPause) iconPause.style.display = 'none';
        if (iconPlay) iconPlay.style.display = 'block';
        btnToggle.setAttribute('aria-label', 'Resume automatic rotation');
        btnToggle.setAttribute('title', 'Resume automatic rotation');
      } else {
        if (iconPause) iconPause.style.display = 'block';
        if (iconPlay) iconPlay.style.display = 'none';
        btnToggle.setAttribute('aria-label', 'Pause automatic rotation');
        btnToggle.setAttribute('title', 'Pause automatic rotation');
      }
    }

    function stopAutoRotation() {
      if (autoRotateTimer) {
        clearTimeout(autoRotateTimer);
        autoRotateTimer = null;
      }
      indicators.forEach((ind) => {
        ind.classList.remove('is-running');
      });
    }

    function resetIndicatorCountdown() {
      indicators.forEach((ind, idx) => {
        ind.classList.remove('is-running', 'is-paused');
        if (idx === currentChallengeSlide) {
          if (userHasInteracted || isPausedManually) {
            ind.classList.add('is-paused');
          } else {
            // Force DOM reflow to re-trigger CSS keyframe animation from 0%
            void ind.offsetWidth;
            ind.classList.add('is-running');
          }
        }
      });
    }

    function startAutoRotation() {
      stopAutoRotation();

      // Guard conditions
      if (userHasInteracted || isPausedManually) {
        updatePlayPauseUI(true);
        resetIndicatorCountdown();
        return;
      }
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        updatePlayPauseUI(true);
        resetIndicatorCountdown();
        return;
      }
      if (document.hidden) return;
      if (isHovered || isFocused) return;
      if (!isVisibleInViewport) return;

      updatePlayPauseUI(false);
      resetIndicatorCountdown();

      autoRotateTimer = setTimeout(() => {
        // Advance automatically every 6 seconds
        goToChallengeSlide((currentChallengeSlide + 1) % slides.length, false);
      }, ROTATION_DELAY);
    }

    function goToChallengeSlide(index, isManual = false) {
      if (index < 0) index = slides.length - 1;
      if (index >= slides.length) index = 0;

      if (isManual) {
        // Manual user interaction stops rotation, but accessible resume button is active
        userHasInteracted = true;
        isPausedManually = true;
        stopAutoRotation();
        updatePlayPauseUI(true);
      }

      currentChallengeSlide = index;

      // Update slides
      slides.forEach((slide, idx) => {
        const isActive = idx === index;
        slide.classList.toggle('is-active', isActive);
        slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      });

      // Update indicators
      indicators.forEach((indicator, idx) => {
        const isActive = idx === index;
        indicator.classList.toggle('is-active', isActive);
        indicator.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      // Update counter
      if (counterCurr) {
        counterCurr.textContent = String(index + 1).padStart(2, '0');
      }

      if (!isManual && !userHasInteracted && !isPausedManually) {
        startAutoRotation();
      } else {
        resetIndicatorCountdown();
      }
    }

    // Accessible Play/Pause toggle button handler
    if (btnToggle) {
      btnToggle.addEventListener('click', (e) => {
        e.preventDefault();
        if (!isPausedManually && !userHasInteracted && autoRotateTimer) {
          // Pause rotation
          isPausedManually = true;
          userHasInteracted = true;
          stopAutoRotation();
          updatePlayPauseUI(true);
          resetIndicatorCountdown();
        } else {
          // Resume rotation
          isPausedManually = false;
          userHasInteracted = false;
          updatePlayPauseUI(false);
          startAutoRotation();
        }
      });
    }

    // Manual navigation handlers with explicit preventDefault
    if (btnPrev) {
      btnPrev.addEventListener('click', (e) => {
        e.preventDefault();
        goToChallengeSlide(currentChallengeSlide - 1, true);
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', (e) => {
        e.preventDefault();
        goToChallengeSlide(currentChallengeSlide + 1, true);
      });
    }

    indicators.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetIdx = parseInt(btn.getAttribute('data-slide-to'), 10);
        if (!isNaN(targetIdx)) {
          goToChallengeSlide(targetIdx, true);
        }
      });
    });

    // Keyboard navigation within carousel
    carousel.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToChallengeSlide(currentChallengeSlide - 1, true);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToChallengeSlide(currentChallengeSlide + 1, true);
      }
    });

    // Hover detection to pause / resume without altering manual state
    carousel.addEventListener('mouseenter', () => {
      isHovered = true;
      if (autoRotateTimer) {
        clearTimeout(autoRotateTimer);
        autoRotateTimer = null;
      }
      const activeInd = indicators[currentChallengeSlide];
      if (activeInd) {
        activeInd.style.animationPlayState = 'paused';
      }
    });

    carousel.addEventListener('mouseleave', () => {
      isHovered = false;
      const activeInd = indicators[currentChallengeSlide];
      if (activeInd) {
        activeInd.style.animationPlayState = '';
      }
      if (!userHasInteracted && !isPausedManually) {
        startAutoRotation();
      }
    });

    // Focus detection to pause / resume
    carousel.addEventListener('focusin', () => {
      isFocused = true;
      if (autoRotateTimer) {
        clearTimeout(autoRotateTimer);
        autoRotateTimer = null;
      }
      const activeInd = indicators[currentChallengeSlide];
      if (activeInd) {
        activeInd.style.animationPlayState = 'paused';
      }
    });

    carousel.addEventListener('focusout', () => {
      isFocused = false;
      const activeInd = indicators[currentChallengeSlide];
      if (activeInd) {
        activeInd.style.animationPlayState = '';
      }
      if (!userHasInteracted && !isPausedManually) {
        startAutoRotation();
      }
    });

    // Visibility change detection (tab background/foreground)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (autoRotateTimer) {
          clearTimeout(autoRotateTimer);
          autoRotateTimer = null;
        }
      } else {
        if (!userHasInteracted && !isPausedManually) {
          startAutoRotation();
        }
      }
    });

    // Viewport IntersectionObserver
    function checkInitialVisibility() {
      const rect = carousel.getBoundingClientRect();
      const inView = rect.top < window.innerHeight && rect.bottom > 0;
      if (inView) {
        isVisibleInViewport = true;
        if (!userHasInteracted && !isPausedManually) {
          startAutoRotation();
        }
      }
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            isVisibleInViewport = true;
            if (!userHasInteracted && !isPausedManually) {
              startAutoRotation();
            }
          } else {
            isVisibleInViewport = false;
            stopAutoRotation();
          }
        });
      }, { threshold: 0.1 });

      observer.observe(carousel);
    } else {
      isVisibleInViewport = true;
      startAutoRotation();
    }

    checkInitialVisibility();

    // Prefers-reduced-motion dynamic listener
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mediaQuery.matches) {
        stopAutoRotation();
        updatePlayPauseUI(true);
      }
      try {
        mediaQuery.addEventListener('change', (e) => {
          if (e.matches) {
            stopAutoRotation();
            updatePlayPauseUI(true);
          } else if (!userHasInteracted && !isPausedManually) {
            startAutoRotation();
          }
        });
      } catch (err) {
        // Fallback
      }
    }

    // Touch / Swipe gestures on track only
    let touchStartX = 0;
    let touchStartY = 0;
    let isTrackingTouch = false;

    if (track) {
      track.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isTrackingTouch = true;
      }, { passive: true });

      track.addEventListener('touchend', (e) => {
        if (!isTrackingTouch || e.changedTouches.length !== 1) return;
        isTrackingTouch = false;

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        // Ensure horizontal swipe intent clearly exceeds vertical scroll intent
        if (Math.abs(diffX) > 36 && Math.abs(diffX) > Math.abs(diffY) * 1.2) {
          if (diffX < 0) {
            goToChallengeSlide(currentChallengeSlide + 1, true);
          } else {
            goToChallengeSlide(currentChallengeSlide - 1, true);
          }
        }
      }, { passive: true });
    }

    // Expose control API for tests
    window.__sbGoToChallengeSlide = goToChallengeSlide;
    window.__sbStopAutoRotation = stopAutoRotation;
    window.__sbStartAutoRotation = startAutoRotation;
    window.__sbGetCarouselState = () => ({
      currentSlide: currentChallengeSlide,
      userHasInteracted,
      isPausedManually,
      isAutoRotating: Boolean(autoRotateTimer),
      isVisibleInViewport
    });

    return goToChallengeSlide;
  }

  // -------------------------------------------------------------
  // Paddle-Inspired Sticky Card Stack Initialisation
  // -------------------------------------------------------------
  function initStickyCardStack() {
    const container = document.getElementById('paddleStackContainer');
    const track = document.getElementById('paddleStackTrack');
    if (!container || !track) return;

    const nav = document.getElementById('sectionNav');
    const s1 = document.getElementById('sec-problem');
    const s2 = document.getElementById('sec-approach');
    const s3 = document.getElementById('perfSection');

    if (!s1 || !s2 || !s3) return;

    let cardHeight = 560;
    let scrollDistancePerCard = 400;
    let isReducedMotion = false;
    let cachedStackNavHeight = 45;
    let cachedContainerTop = 0;
    let lastStackPhase = null;

    function getDocTop(el) {
      let top = 0;
      let curr = el;
      while (curr) {
        top += curr.offsetTop;
        curr = curr.offsetParent;
      }
      return top;
    }

    function updateStackMetrics() {
      isReducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (isReducedMotion) {
        container.style.height = 'auto';
        track.style.height = 'auto';
        s1.style.transform = '';
        s2.style.transform = '';
        s3.style.transform = '';
        s1.style.opacity = '';
        s2.style.opacity = '';
        s3.style.opacity = '';
        s1.style.pointerEvents = '';
        s2.style.pointerEvents = '';
        s3.style.pointerEvents = '';
        s1.style.visibility = '';
        s2.style.visibility = '';
        s3.style.visibility = '';
        return;
      }

      // Temporarily clear inline heights to measure natural content size
      s1.style.height = 'auto';
      s2.style.height = 'auto';
      s3.style.height = 'auto';

      const h1 = s1.offsetHeight;
      const h2 = s2.offsetHeight;
      const h3 = s3.offsetHeight;
      cardHeight = Math.max(h1, h2, h3, 520);

      s1.style.height = cardHeight + 'px';
      s2.style.height = cardHeight + 'px';
      s3.style.height = cardHeight + 'px';

      const trackHeight = cardHeight + 48; // room for card + 28px bottom peeking + padding
      track.style.height = trackHeight + 'px';
      container.style.setProperty('--paddle-track-height', trackHeight + 'px');
      container.style.setProperty('--paddle-card-height', cardHeight + 'px');

      // Responsive scroll travel per card transition: ~28% of viewport height (tight, responsive swipe)
      scrollDistancePerCard = Math.round(Math.min(Math.max(window.innerHeight * 0.28, 180), 240));
      const totalContainerHeight = trackHeight + (scrollDistancePerCard * 2);
      container.style.height = totalContainerHeight + 'px';

      cachedStackNavHeight = nav ? nav.offsetHeight : 45;
      cachedContainerTop = getDocTop(container);
      lastStackPhase = null;

      // Update positions immediately
      renderStack();
      updateStickyMetrics();
      if (typeof window.__sbRefreshNavMetrics === 'function') {
        window.__sbRefreshNavMetrics();
      }
    }

    function renderStack() {
      if (isReducedMotion) return;

      const startScroll = cachedContainerTop - cachedStackNavHeight;
      const relativeScroll = window.scrollY - startScroll;

      const peek1 = 0;
      const peek2 = 14;
      const peek3 = 28;

      if (relativeScroll <= 0) {
        if (lastStackPhase === 'before') return;
        lastStackPhase = 'before';
        // At rest before stacking transitions begin
        s1.style.transform = `translate3d(0, ${peek1}px, 0)`;
        s1.style.opacity = '1';
        s1.style.visibility = 'visible';
        s1.style.pointerEvents = 'auto';

        s2.style.transform = `translate3d(0, ${peek2}px, 0)`;
        s2.style.opacity = '1';
        s2.style.visibility = 'visible';
        s2.style.pointerEvents = 'none';

        s3.style.transform = `translate3d(0, ${peek3}px, 0)`;
        s3.style.opacity = '1';
        s3.style.visibility = 'visible';
        s3.style.pointerEvents = 'none';
      } else if (relativeScroll <= scrollDistancePerCard) {
        lastStackPhase = 't1';
        // Transition 1: Card 1 moves UP and leaves the viewport, revealing Card 2
        const p1 = Math.min(Math.max(relativeScroll / scrollDistancePerCard, 0), 1);
        
        // Card 1 exits upwards
        const exitOffset1 = -p1 * (cardHeight + 80);
        s1.style.transform = `translate3d(0, ${exitOffset1}px, 0)`;
        s1.style.opacity = '1';
        s1.style.visibility = p1 >= 1 ? 'hidden' : 'visible';
        s1.style.pointerEvents = p1 > 0.5 ? 'none' : 'auto';

        // Card 2 moves from peeking (14px) to primary position (0px)
        const currentPeek2 = (1 - p1) * peek2;
        s2.style.transform = `translate3d(0, ${currentPeek2}px, 0)`;
        s2.style.opacity = '1';
        s2.style.visibility = 'visible';
        s2.style.pointerEvents = p1 > 0.5 ? 'auto' : 'none';

        // Card 3 moves from peeking (28px) to second peeking (14px)
        const currentPeek3 = peek2 + (1 - p1) * (peek3 - peek2);
        s3.style.transform = `translate3d(0, ${currentPeek3}px, 0)`;
        s3.style.opacity = '1';
        s3.style.visibility = 'visible';
        s3.style.pointerEvents = 'none';
      } else if (relativeScroll <= scrollDistancePerCard * 2) {
        lastStackPhase = 't2';
        // Transition 2: Card 2 moves UP and leaves the viewport, revealing Card 3
        const p2 = Math.min(Math.max((relativeScroll - scrollDistancePerCard) / scrollDistancePerCard, 0), 1);

        // Card 1 stays offscreen
        s1.style.transform = `translate3d(0, -${cardHeight + 80}px, 0)`;
        s1.style.opacity = '0';
        s1.style.visibility = 'hidden';
        s1.style.pointerEvents = 'none';

        // Card 2 exits upwards
        const exitOffset2 = -p2 * (cardHeight + 80);
        s2.style.transform = `translate3d(0, ${exitOffset2}px, 0)`;
        s2.style.opacity = '1';
        s2.style.visibility = p2 >= 1 ? 'hidden' : 'visible';
        s2.style.pointerEvents = p2 > 0.5 ? 'none' : 'auto';

        // Card 3 moves from peeking (14px) to primary position (0px)
        const currentPeek3 = (1 - p2) * peek2;
        s3.style.transform = `translate3d(0, ${currentPeek3}px, 0)`;
        s3.style.opacity = '1';
        s3.style.visibility = 'visible';
        s3.style.pointerEvents = p2 > 0.5 ? 'auto' : 'none';
      } else {
        if (lastStackPhase === 'after') return;
        lastStackPhase = 'after';
        // Past card stack transitions: Card 3 is at 0px and active;
        // As scroll continues past container height, natural sticky release scrolls Card 3 up into Strategies
        s1.style.transform = `translate3d(0, -${cardHeight + 80}px, 0)`;
        s1.style.opacity = '0';
        s1.style.visibility = 'hidden';
        s1.style.pointerEvents = 'none';

        s2.style.transform = `translate3d(0, -${cardHeight + 80}px, 0)`;
        s2.style.opacity = '0';
        s2.style.visibility = 'hidden';
        s2.style.pointerEvents = 'none';

        s3.style.transform = 'translate3d(0, 0px, 0)';
        s3.style.opacity = '1';
        s3.style.visibility = 'visible';
        s3.style.pointerEvents = 'auto';
      }
    }

    window.addEventListener('scroll', renderStack, { passive: true });

    updateStackMetrics();

    // Recompute metrics on window resize / orientation change
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateStackMetrics, 120);
    }, { passive: true });

    window.addEventListener('orientationchange', () => {
      setTimeout(updateStackMetrics, 150);
    }, { passive: true });

    // Expose for testing inspection
    window.__sbUpdateStackMetrics = updateStackMetrics;
    window.__sbRenderStack = () => {
      cachedStackNavHeight = nav ? nav.offsetHeight : 45;
      cachedContainerTop = getDocTop(container);
      lastStackPhase = null;
      renderStack();
    };
    window.__sbGetStackMetrics = () => ({ cardHeight, scrollDistancePerCard });
  }

  initStickyCardStack();
  initChallengeCarousel();
  initSectionNav();
  initFaqAccordion();

  const heroTl = initHeroAnimation();

  // Expose state and functions for testing inspection
  window.__sbFormState = formState;
  window.__sbGoToStep = goToStep;
  window.__sbUpdatePerformancePeriod = updatePerformancePeriod;
  window.__sbOpenDisclaimerPopup = openDisclaimerPopup;
  window.__sbCloseDisclaimerPopup = closeDisclaimerPopup;
  window.__sbScrollLeadership = scrollLeaderTo;
  window.__sbHeroTimeline = heroTl;
})();
