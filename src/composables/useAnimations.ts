import { onMounted, onUnmounted, type Ref } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function useAnimations() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const fadeInUp = (element: gsap.TweenTarget, delay = 0) => {
    if (prefersReducedMotion) {
      gsap.set(element, { opacity: 1, y: 0 })
      return
    }
    return gsap.fromTo(
      element,
      { opacity: 0, y: 60 },
      { opacity: 1, y: 0, duration: 1, delay, ease: 'power3.out' }
    )
  }

  const fadeIn = (element: gsap.TweenTarget, delay = 0) => {
    if (prefersReducedMotion) {
      gsap.set(element, { opacity: 1 })
      return
    }
    return gsap.fromTo(
      element,
      { opacity: 0 },
      { opacity: 1, duration: 0.8, delay, ease: 'power2.out' }
    )
  }

  const scaleIn = (element: gsap.TweenTarget, delay = 0) => {
    if (prefersReducedMotion) {
      gsap.set(element, { scale: 1, opacity: 1 })
      return
    }
    return gsap.fromTo(
      element,
      { scale: 0.8, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.8, delay, ease: 'back.out(1.7)' }
    )
  }

  const slideInFromLeft = (element: gsap.TweenTarget, delay = 0) => {
    if (prefersReducedMotion) {
      gsap.set(element, { x: 0, opacity: 1 })
      return
    }
    return gsap.fromTo(
      element,
      { x: -100, opacity: 0 },
      { x: 0, opacity: 1, duration: 1, delay, ease: 'power3.out' }
    )
  }

  const slideInFromRight = (element: gsap.TweenTarget, delay = 0) => {
    if (prefersReducedMotion) {
      gsap.set(element, { x: 0, opacity: 1 })
      return
    }
    return gsap.fromTo(
      element,
      { x: 100, opacity: 0 },
      { x: 0, opacity: 1, duration: 1, delay, ease: 'power3.out' }
    )
  }

  const slideInFromBottom = (element: gsap.TweenTarget, delay = 0) => {
    if (prefersReducedMotion) {
      gsap.set(element, { y: 0, opacity: 1 })
      return
    }
    return gsap.fromTo(
      element,
      { y: 100, opacity: 0 },
      { y: 0, opacity: 1, duration: 1, delay, ease: 'power3.out' }
    )
  }

  const staggerChildren = (parent: gsap.TweenTarget, children: string, delay = 0.1) => {
    if (prefersReducedMotion) {
      gsap.set(children, { opacity: 1, y: 0 })
      return
    }
    return gsap.fromTo(
      children,
      { opacity: 0, y: 50 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        stagger: delay,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: parent,
          start: 'top 80%',
          toggleActions: 'play none none none'
        }
      }
    )
  }

  const parallax = (element: gsap.TweenTarget, speed = 0.5) => {
    if (prefersReducedMotion) return
    return gsap.to(element, {
      yPercent: speed * 100,
      ease: 'none',
      scrollTrigger: {
        trigger: element,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true
      }
    })
  }

  const rotate3D = (element: gsap.TweenTarget, rotationX = 0, rotationY = 0) => {
    if (prefersReducedMotion) return
    return gsap.to(element, {
      rotationX,
      rotationY,
      transformPerspective: 1000,
      duration: 0.6,
      ease: 'power2.out'
    })
  }

  const counterAnimation = (element: HTMLElement, target: number, duration = 2) => {
    if (prefersReducedMotion) {
      element.textContent = target.toString()
      return
    }
    const obj = { value: 0 }
    return gsap.to(obj, {
      value: target,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        element.textContent = Math.floor(obj.value).toString()
      }
    })
  }

  const textReveal = (element: gsap.TweenTarget, splitBy: 'chars' | 'words' = 'words') => {
    if (prefersReducedMotion) {
      gsap.set(element, { opacity: 1 })
      return
    }
    
    const text = element as HTMLElement
    if (!text) return

    if (splitBy === 'words') {
      const words = text.textContent?.split(' ') || []
      text.innerHTML = words.map(word => `<span class="word-reveal" style="display: inline-block; opacity: 0;">${word}</span>`).join(' ')
      const wordElements = text.querySelectorAll('.word-reveal')
      return gsap.to(wordElements, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.05,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: text,
          start: 'top 80%',
          toggleActions: 'play none none none'
        }
      })
    } else {
      const chars = text.textContent?.split('') || []
      text.innerHTML = chars.map(char => `<span class="char-reveal" style="display: inline-block; opacity: 0;">${char === ' ' ? '&nbsp;' : char}</span>`).join('')
      const charElements = text.querySelectorAll('.char-reveal')
      return gsap.to(charElements, {
        opacity: 1,
        y: 0,
        duration: 0.4,
        stagger: 0.02,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: text,
          start: 'top 80%',
          toggleActions: 'play none none none'
        }
      })
    }
  }

  const pulse = (element: gsap.TweenTarget) => {
    if (prefersReducedMotion) return
    return gsap.to(element, {
      scale: 1.05,
      duration: 1.5,
      repeat: -1,
      yoyo: true,
      ease: 'power2.inOut'
    })
  }

  const float = (element: gsap.TweenTarget, distance = 20) => {
    if (prefersReducedMotion) return
    return gsap.to(element, {
      y: -distance,
      duration: 2 + Math.random() * 2,
      repeat: -1,
      yoyo: true,
      ease: 'power1.inOut'
    })
  }

  const glow = (element: gsap.TweenTarget) => {
    if (prefersReducedMotion) return
    return gsap.to(element, {
      boxShadow: '0 0 20px rgba(47, 110, 204, 0.5)',
      duration: 1.5,
      repeat: -1,
      yoyo: true,
      ease: 'power2.inOut'
    })
  }

  return {
    fadeInUp,
    fadeIn,
    scaleIn,
    slideInFromLeft,
    slideInFromRight,
    slideInFromBottom,
    staggerChildren,
    parallax,
    rotate3D,
    counterAnimation,
    textReveal,
    pulse,
    float,
    glow,
    prefersReducedMotion
  }
}

