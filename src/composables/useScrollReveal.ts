import { onMounted, onUnmounted, type Ref } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function useScrollReveal() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const revealOnScroll = (
    element: gsap.TweenTarget,
    options: {
      direction?: 'up' | 'down' | 'left' | 'right'
      distance?: number
      duration?: number
      delay?: number
      start?: string
    } = {}
  ) => {
    if (prefersReducedMotion) {
      gsap.set(element, { opacity: 1, x: 0, y: 0 })
      return
    }

    const {
      direction = 'up',
      distance = 100,
      duration = 1,
      delay = 0,
      start = 'top 80%'
    } = options

    const fromProps: gsap.TweenVars = { opacity: 0 }
    const toProps: gsap.TweenVars = {
      opacity: 1,
      duration,
      delay,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: element,
        start,
        toggleActions: 'play none none none'
      }
    }

    switch (direction) {
      case 'up':
        fromProps.y = distance
        toProps.y = 0
        break
      case 'down':
        fromProps.y = -distance
        toProps.y = 0
        break
      case 'left':
        fromProps.x = distance
        toProps.x = 0
        break
      case 'right':
        fromProps.x = -distance
        toProps.x = 0
        break
    }

    return gsap.fromTo(element, fromProps, toProps)
  }

  const staggerReveal = (
    parent: gsap.TweenTarget,
    children: string,
    options: {
      direction?: 'up' | 'down' | 'left' | 'right'
      distance?: number
      stagger?: number
      start?: string
    } = {}
  ) => {
    if (prefersReducedMotion) {
      gsap.set(children, { opacity: 1, x: 0, y: 0 })
      return
    }

    const {
      direction = 'up',
      distance = 50,
      stagger = 0.1,
      start = 'top 80%'
    } = options

    const fromProps: gsap.TweenVars = { opacity: 0 }
    const toProps: gsap.TweenVars = {
      opacity: 1,
      duration: 0.8,
      stagger,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: parent,
        start,
        toggleActions: 'play none none none'
      }
    }

    switch (direction) {
      case 'up':
        fromProps.y = distance
        toProps.y = 0
        break
      case 'down':
        fromProps.y = -distance
        toProps.y = 0
        break
      case 'left':
        fromProps.x = distance
        toProps.x = 0
        break
      case 'right':
        fromProps.x = -distance
        toProps.x = 0
        break
    }

    return gsap.fromTo(children, fromProps, toProps)
  }

  const parallaxScroll = (
    element: gsap.TweenTarget,
    speed: number = 0.5,
    options: {
      start?: string
      end?: string
    } = {}
  ) => {
    if (prefersReducedMotion) return

    const { start = 'top bottom', end = 'bottom top' } = options

    return gsap.to(element, {
      yPercent: speed * 100,
      ease: 'none',
      scrollTrigger: {
        trigger: element,
        start,
        end,
        scrub: true
      }
    })
  }

  const scaleOnScroll = (
    element: gsap.TweenTarget,
    options: {
      start?: string
      end?: string
      scaleFrom?: number
      scaleTo?: number
    } = {}
  ) => {
    if (prefersReducedMotion) {
      gsap.set(element, { scale: 1 })
      return
    }

    const {
      start = 'top bottom',
      end = 'top center',
      scaleFrom = 0.8,
      scaleTo = 1
    } = options

    return gsap.fromTo(
      element,
      { scale: scaleFrom },
      {
        scale: scaleTo,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: element,
          start,
          end,
          scrub: true
        }
      }
    )
  }

  const rotateOnScroll = (
    element: gsap.TweenTarget,
    rotation: number = 360,
    options: {
      start?: string
      end?: string
    } = {}
  ) => {
    if (prefersReducedMotion) return

    const { start = 'top bottom', end = 'bottom top' } = options

    return gsap.to(element, {
      rotation,
      ease: 'none',
      scrollTrigger: {
        trigger: element,
        start,
        end,
        scrub: true
      }
    })
  }

  const pinOnScroll = (
    element: gsap.TweenTarget,
    options: {
      start?: string
      end?: string
      pinSpacing?: boolean
    } = {}
  ) => {
    if (prefersReducedMotion) return

    const {
      start = 'top top',
      end = '+=100%',
      pinSpacing = true
    } = options

    return ScrollTrigger.create({
      trigger: element,
      start,
      end,
      pin: true,
      pinSpacing
    })
  }

  const cleanup = () => {
    ScrollTrigger.getAll().forEach(trigger => trigger.kill())
  }

  onUnmounted(() => {
    cleanup()
  })

  return {
    revealOnScroll,
    staggerReveal,
    parallaxScroll,
    scaleOnScroll,
    rotateOnScroll,
    pinOnScroll,
    cleanup,
    prefersReducedMotion
  }
}

