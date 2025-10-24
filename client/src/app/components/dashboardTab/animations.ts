/**
 * Animation variants for Framer Motion components
 * Premium 2025 Animation System
 */

// ============================================
// PREMIUM SPRING CONFIGURATIONS
// ============================================

// Spring animation configurations
export const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20
};

export const cardSpring = {
  type: "spring" as const,
  stiffness: 200,
  damping: 25
};

// Premium spring configurations for 2025
export const premiumSpring = {
  type: "spring" as const,
  stiffness: 260,
  damping: 20,
  mass: 0.8
};

export const quickSpring = {
  type: "spring" as const,
  stiffness: 400,
  damping: 30,
  mass: 0.5
};

// ============================================
// CARD ANIMATION VARIANTS
// ============================================

// Card animation variants
export const cardVariants = {
  hidden: { 
    opacity: 0, 
    y: 20,
    scale: 0.95
  },
  visible: (index: number) => ({ 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: {
      ...springConfig,
      delay: index * 0.05
    }
  }),
  hover: {
    scale: 1.02,
    y: -4,
    transition: cardSpring
  },
  tap: {
    scale: 0.98,
    transition: { duration: 0.1 }
  }
};

// Glassmorphic card hover effect
export const glassCardVariants = {
  rest: {
    scale: 1,
    y: 0,
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
    transition: premiumSpring
  },
  hover: {
    scale: 1.02,
    y: -6,
    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.15), 0 0 30px rgba(59, 130, 246, 0.2)",
    transition: premiumSpring
  },
  tap: {
    scale: 0.98,
    transition: quickSpring
  }
};

// ============================================
// MODAL & PANEL VARIANTS
// ============================================

// Modal animation variants
export const modalVariants = {
  hidden: { 
    opacity: 0,
    scale: 0.9,
    y: 50
  },
  visible: { 
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      ...cardSpring,
      duration: 0.4
    }
  },
  exit: { 
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: {
      duration: 0.2
    }
  }
};

// Side panel slide-in from right
export const sidePanelVariants = {
  hidden: {
    x: "100%",
    opacity: 0
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: [0.32, 0.72, 0, 1] as const, // Custom easing for smooth slide
      staggerChildren: 0.05,
      delayChildren: 0.2
    }
  },
  exit: {
    x: "100%",
    opacity: 0,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 1, 1] as const
    }
  }
};

// ============================================
// BACKDROP VARIANTS
// ============================================

// Backdrop animation variants
export const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { duration: 0.3 }
  },
  exit: { 
    opacity: 0,
    transition: { duration: 0.2 }
  }
};

// Glassmorphic backdrop
export const glassBackdropVariants = {
  hidden: {
    opacity: 0,
    backdropFilter: "blur(0px)"
  },
  visible: {
    opacity: 1,
    backdropFilter: "blur(12px)",
    transition: {
      duration: 0.3
    }
  },
  exit: {
    opacity: 0,
    backdropFilter: "blur(0px)",
    transition: {
      duration: 0.2
    }
  }
};

// ============================================
// STAGGER CONTAINERS
// ============================================

// Stagger container variants
export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03
    }
  }
};

// ============================================
// CARRIER & COMPANY ANIMATIONS
// ============================================

// Expanded carrier card transformation
export const carrierExpansionVariants = {
  collapsed: {
    scale: 1,
    opacity: 1,
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const }
  },
  expanded: {
    scale: 1.05,
    opacity: 0,
    transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const }
  }
};

// Company list slide-up entrance
export const companyListVariants = {
  hidden: {
    opacity: 0,
    y: 60,
    scale: 0.95
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.34, 1.56, 0.64, 1] as const, // Spring-like easing
      staggerChildren: 0.04,
      delayChildren: 0.15
    }
  }
};

// Individual company card entrance
export const companyCardVariants = {
  hidden: {
    opacity: 0,
    x: -20,
    scale: 0.95
  },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: premiumSpring
  },
  hover: {
    y: -4,
    scale: 1.01,
    boxShadow: "0 12px 24px rgba(0, 0, 0, 0.12)",
    transition: quickSpring
  }
};

// ============================================
// MONTHLY BREAKDOWN ANIMATIONS
// ============================================

// Monthly bar chart stagger
export const monthlyBarVariants = {
  hidden: {
    scaleX: 0,
    opacity: 0,
    originX: 0
  },
  visible: (custom: number) => ({
    scaleX: 1,
    opacity: 1,
    transition: {
      duration: 0.6,
      delay: custom * 0.04, // 40ms stagger
      ease: [0.34, 1.56, 0.64, 1] as const
    }
  })
};

// ============================================
// COUNTER & STAT ANIMATIONS
// ============================================

// Counter number animation
export const counterVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.4, 0, 0.2, 1] as const
    }
  }
};

// ============================================
// BADGE & RANK ANIMATIONS
// ============================================

// Rank badge glow pulse
export const rankBadgeVariants = {
  idle: {
    boxShadow: "0 0 20px rgba(251, 191, 36, 0.3)"
  },
  pulse: {
    boxShadow: [
      "0 0 20px rgba(251, 191, 36, 0.3)",
      "0 0 35px rgba(251, 191, 36, 0.6)",
      "0 0 20px rgba(251, 191, 36, 0.3)"
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
};

// ============================================
// INPUT & SEARCH ANIMATIONS
// ============================================

// Search input focus expand
export const searchInputVariants = {
  blur: {
    width: "100%",
    transition: premiumSpring
  },
  focus: {
    width: "100%",
    scale: 1.02,
    transition: premiumSpring
  }
};

// ============================================
// PREMIUM HOVER-REVEAL CARDS
// ============================================

// Card Hover Lift with Shadow Enhancement
export const cardHoverLift = {
  rest: {
    y: 0,
    scale: 1,
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1]
    }
  },
  hover: {
    y: -8,
    scale: 1.02,
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1]
    }
  }
};

// Staggered Reveal for Card Details
export const staggeredReveal = {
  hidden: {
    opacity: 0,
    y: 20
  },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      delay: delay,
      ease: [0.4, 0, 0.2, 1]
    }
  })
};

// Gradient Intensity Animation
export const gradientIntensity = {
  initial: {
    opacity: 0.3
  },
  hover: {
    opacity: 1,
    transition: {
      duration: 0.3
    }
  }
};

