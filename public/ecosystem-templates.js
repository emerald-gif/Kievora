// ecosystem-templates.js — Trisend Visual Builder Templates
// Each category gets a pre-assembled page of sections.
// Templates reference section IDs from ecosystem-sections.js.
// The builder loads these to give users a real starting point.

(function () {
'use strict';

// ─────────────────────────────────────────────────────────────────
// TEMPLATE REGISTRY
// Each template:
//   id         → matches site type value
//   name       → display name
//   emoji      → icon
//   desc       → shown on template picker
//   palette    → default CSS variable values
//   fonts      → heading + body font pair
//   sections   → ordered array of section IDs to assemble
//   fieldOverrides → per-section default text (makes content relevant)
// ─────────────────────────────────────────────────────────────────

window.ECO_TEMPLATES = [

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. E-COMMERCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'ecommerce',
  name: 'E-Commerce Store',
  emoji: '🛍️',
  desc: 'Showcase and sell your products via WhatsApp',
  palette: { S1: '#0f0f0f', S2: '#7C3AED', S3: '#6366F1' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['hero-split', 'features-3col', 'menu-grid', 'testimonials-cards', 'faq-section', 'contact-whatsapp', 'footer-full'],
  overrides: {
    'hero-split': {
      badge: '🛍️ Free delivery on orders over ₦10,000',
      headline: 'Shop the Best\nProducts Online',
      subtext: 'Handpicked quality products delivered to your door. Browse our collection and order directly via WhatsApp.',
      'cta-text': 'Shop Now →',
      'cta-link': '#products',
      'cta2-text': 'View Categories',
      'cta2-link': '#categories',
    },
    'features-3col': {
      headline: 'Why Shop With Us',
      subtext: 'We make online shopping simple, safe, and enjoyable.',
      'f1-icon': '🚚', 'f1-title': 'Fast Delivery',      'f1-desc': 'Same-day and next-day delivery available across Lagos and major cities.',
      'f2-icon': '✅', 'f2-title': '100% Authentic',    'f2-desc': 'Every product is carefully verified. What you see is exactly what you get.',
      'f3-icon': '💬', 'f3-title': 'Easy WhatsApp Order','f3-desc': 'No complicated checkout. Just message us and we handle the rest instantly.',
    },
    'menu-grid': {
      headline: 'Featured Products',
      'btn-text': 'Order via WhatsApp →',
    },
    'testimonials-cards': {
      headline: 'What Our Customers Say',
    },
    'cta-bold': {
      headline: 'Ready to Shop?\nOrder in 60 Seconds.',
      subtext: 'Send us a WhatsApp message with your order. We confirm and deliver.',
      'btn-text': 'Order on WhatsApp →',
      'btn-link': 'https://wa.me/',
    },
    'faq-section': {
      headline: 'Shopping FAQs',
      q1: 'How do I place an order?',
      a1: 'Click any "Order via WhatsApp" button or send us a direct message with the product name and your delivery address.',
      q2: 'What areas do you deliver to?',
      a2: 'We deliver across Lagos and Abuja. Other states are available via courier — contact us for rates.',
      q3: 'How long does delivery take?',
      a3: 'Lagos deliveries are same-day or next-day. Nationwide deliveries take 2–4 business days.',
      q4: 'What is your return policy?',
      a4: 'We accept returns within 48 hours of delivery for damaged or incorrect items. Contact us on WhatsApp immediately.',
    },
  },

  variant2: {
    name: 'Bold Showcase',
    sections: ['hero-centered', 'gallery-grid', 'menu-grid', 'about-story', 'newsletter-section', 'ecom-star-badges', 'contact-info-cards', 'footer-full'],
    overrides: {
      'hero-centered': { badge: '🛍️ New arrivals weekly', headline: 'Shop The Look\nYou Have Been\nWaiting For', subtext: 'Quality products, fast delivery, prices that make sense.', 'cta-text': 'Shop Now →' },
      'gallery-grid': { headline: 'As Seen On Our Socials', subtext: 'Real customers, real style.' },
      'newsletter-section': { headline: 'Get 10% Off Your First Order', subtext: 'Join our list for deals and new drops.', 'btn-text': 'Subscribe' },
      'ecom-star-badges': { count: 'Based on 3,000+ reviews', r1: 'Great quality, fast shipping.', r2: 'Exactly as described, love it.', r3: 'Will definitely order again.' },
      'contact-info-cards': { headline: 'Questions? We\'re Here', location: 'Lagos, Nigeria' },
    },
  },
  variant3: {
    name: 'Bold Marketplace',
    sections: ['ecom-bold-hero', 'ecom-deal-strip', 'ecom-category-tiles', 'testimonial-marquee-strip', 'newsletter-section', 'contact-cta-banner', 'footer-full'],
    overrides: {
      'ecom-bold-hero': {
        badge: '⚡ Flash deals live now',
        headline: 'Everything You Need,',
        highlight: 'One Tap Away',
        subtext: "Thousands of products, fast delivery, prices you'll actually like.",
        'search-ph': 'Search for products...',
        cat1: 'Electronics', cat2: 'Fashion', cat3: 'Home & Living', cat4: 'Beauty',
        trust1: 'Fast delivery', trust2: 'Secure checkout', trust3: 'Easy returns',
      },
      'ecom-deal-strip': {
        headline: '🔥 Flash Deals',
        'd1-name': 'Wireless Earbuds', 'd1-old': '₦25,000', 'd1-new': '₦16,500', 'd1-pct': '-34%',
        'd2-name': 'Smart Watch', 'd2-old': '₦45,000', 'd2-new': '₦29,900', 'd2-pct': '-33%',
        'd3-name': 'Sneakers', 'd3-old': '₦18,000', 'd3-new': '₦12,000', 'd3-pct': '-33%',
        'd4-name': 'Backpack', 'd4-old': '₦14,000', 'd4-new': '₦9,000', 'd4-pct': '-36%',
      },
      'ecom-category-tiles': {
        headline: 'Shop by Category',
        't1-name': 'Electronics', 't2-name': 'Fashion', 't3-name': 'Home & Living',
      },
      'newsletter-section': { headline: 'Never Miss a Deal', subtext: 'Flash sales, restocks, and drops — straight to your inbox.', 'btn-text': 'Notify Me' },
      'contact-cta-banner': { headline: 'Need Help With an Order?', subtext: 'Our support team replies fast.', 'cta-text': 'Chat With Us →' },
      'testimonial-marquee-strip': {
        headline: 'Loved by shoppers',
        q1: 'Fast delivery every time, no wahala.', n1: 'Tolu A.',
        q2: 'Prices are actually the best I have found.', n2: 'Chiamaka N.',
        q3: 'Customer service replied within minutes.', n3: 'Bashir M.',
        q4: 'My go-to for electronics now.', n4: 'Ifeoma E.',
      },
    },
  },
  variant4: {
    name: 'Minimal Boutique',
    sections: ['ecom-minimal-hero', 'ecom-product-spotlight', 'about-story', 'stats-with-quote', 'newsletter-section', 'contact-form-split', 'footer-full'],
    overrides: {
      'ecom-minimal-hero': {
        eyebrow: 'New Collection',
        headline: 'Considered pieces for everyday living',
        subtext: 'Thoughtfully made, built to last. No noise, just quality.',
        'cta-text': 'Shop the collection',
        'cta-link': '#products',
      },
      'ecom-product-spotlight': {
        eyebrow: 'Bestseller',
        name: 'The Everyday Tote',
        desc: 'Full-grain leather, hand-stitched, built for the long run. One bag, every day.',
        price: '₦45,000',
        'cta-text': 'Add to cart',
        f1: 'Full-grain leather', f2: 'Hand-stitched details', f3: 'Lifetime repair guarantee',
      },
      'about-story': { headline: 'Made With Intention', subtext: 'Every piece is designed to outlast trends — quality you can feel.' },
      'stats-with-quote': { stat: '97%', 'stat-lbl': 'Would repurchase', quote: '"Simple, well made, and it just works. Exactly what I wanted."', name: 'Zainab R.' },
      'newsletter-section': { headline: 'Join the List', subtext: 'New drops and quiet sales, sent occasionally.', 'btn-text': 'Subscribe' },
      'contact-form-split': { headline: 'Questions About a Piece?', subtext: 'Happy to help before you buy.' },
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. DIGITAL PRODUCTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'digital_marketplace',
  name: 'Digital Products',
  emoji: '📦',
  desc: 'Sell eBooks, courses, templates & digital files',
  palette: { S1: '#0f172a', S2: '#8B5CF6', S3: '#6366F1' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['digital-hero', 'features-3col', 'menu-grid', 'newsletter-section', 'cta-bold', 'footer-full'],
  overrides: {'digital-hero': {'badge': '⚡ Instant Download • Lifetime Access', 'headline': 'Premium Digital\nProducts That\nPay Dividends', 'subtext': 'Templates, eBooks, courses, and tools. Pay once, use forever.', 'cta-text': 'Browse Products →', 'cta-link': '#products', 'customers': '5,000+', 'product1': 'Business Finance Tracker Template', 'product2': 'Digital Marketing Mastery eBook', 'product3': 'Brand Identity Kit (Canva)'},
    'features-3col': {
      headline: 'Why Our Products Stand Out',
      'f1-icon': '⚡', 'f1-title': 'Instant Download',  'f1-desc': 'Get your file immediately after payment is confirmed via WhatsApp.',
      'f2-icon': '🎯', 'f2-title': 'Pro Quality',       'f2-desc': 'Every product is professionally crafted and tested before being listed.',
      'f3-icon': '🔄', 'f3-title': 'Free Updates',      'f3-desc': 'All products come with lifetime updates at no extra cost.',
    },
    'menu-grid': {
      headline: 'Popular Products',
      'btn-text': 'Get Instant Access →',
    },
    'newsletter-section': {
      headline: 'Get Free Resources Every Week',
      subtext: 'Join 5,000+ subscribers who get free templates, tips and exclusive deals.',
      'btn-text': 'Subscribe Free',
    },
    'cta-bold': {
      headline: 'Start Growing Your Business Today',
      subtext: 'Professional tools and resources at an affordable price.',
      'btn-text': 'Browse All Products',
    },
  },
  variant2: {
    name: 'Course Launch',
    sections: ['course-hero', 'course-curriculum', 'course-success-banner', 'newsletter-section', 'footer-full'],
    overrides: {
      'course-hero': {
        badge: '🎓 Enrollment open now',
        headline: 'Learn the skill, get the results',
        subtext: 'A complete, practical course — no fluff, just what actually works.',
        'cta-text': 'Enroll Now',
        'cta-link': '#enroll',
        students: '👥 1,200+ students',
        rating: '⭐ 4.9 rating',
        price: '₦15,000',
      },
      'course-curriculum': {
        headline: "What You'll Learn",
        m1: 'Getting started — the foundations',
        m2: 'Core techniques that actually work',
        m3: 'Real-world practice projects',
        m4: 'Advanced tips and next steps',
      },
      'course-success-banner': { stat: '89%', text: 'of students land results within 30 days of finishing.' },
      'newsletter-section': { headline: 'Get a Free Preview Lesson', subtext: 'See what the course covers before you enroll.', 'btn-text': 'Send Me the Preview' },
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. RESTAURANT / FOOD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'restaurant',
  name: 'Restaurant / Food',
  emoji: '🍽️',
  desc: 'Show your menu and take orders via WhatsApp',
  palette: { S1: '#1a0a00', S2: '#F97316', S3: '#EF4444' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['rest-hero', 'menu-grid', 'about-story', 'testimonials-cards', 'contact-whatsapp', 'footer-full'],
  overrides: {'rest-hero': {'badge': '🍽️ Order Now • Authentic Nigerian Cuisine', 'headline': 'Mama\'s Kitchen\nTastes Like Home', 'tagline': 'Fresh ingredients cooked daily. Every plate tells a story.', 'cta-text': '📱 Order on WhatsApp', 'hours': 'Open 11am – 10pm'},
    'menu-grid': {
      headline: 'Today\'s Menu',
      'btn-text': 'Order via WhatsApp →',
      'item1-name': 'Jollof Rice Special',
      'item1-desc': 'Party-style jollof with grilled chicken and fried plantain',
      'item1-price': '₦2,500',
      'item2-name': 'Egusi Soup + Swallow',
      'item2-price': '₦1,800',
      'item3-name': 'Pepper Soup (Assorted)',
      'item3-price': '₦2,000',
      'item4-name': 'Chapman / Fresh Juice',
      'item4-price': '₦800',
    },
    'about-story': {
      eyebrow: 'Our Story',
      headline: 'Cooked with Love,\nServed with Pride',
      para1: 'We started from a family kitchen in 2018 with one mission: bring the true taste of Nigerian home cooking to everyone. No shortcuts, no artificial anything — just real food made the way Mama taught us.',
      para2: 'Today we serve hundreds of customers daily, but every plate still gets the same care and attention as that very first one. Come taste the difference.',
      'stat1-n': '6yrs', 'stat1-l': 'In Business',
      'stat2-n': '500+', 'stat2-l': 'Daily Customers',
      'stat3-n': '4.9★', 'stat3-l': 'Google Rating',
    },
    'testimonials-cards': {
      headline: 'What Our Customers Say',
      't1-quote': '"Best jollof rice in Lagos, no debate. The portions are generous and the flavour is exactly how my grandmother used to make it."',
      't2-quote': '"I order from them every week. The food is always hot, fresh, and delivered on time. Customer service is also top-notch."',
      't3-quote': '"My whole office orders from here now. We discovered them 3 months ago and haven\'t looked back since. Absolutely delicious!"',
    },
    'contact-whatsapp': {
      headline: 'Ready to Order?',
      subtext: 'Send us a WhatsApp message with your order. We confirm and prepare immediately.',
      'btn-text': 'Send WhatsApp Order',
    },
  },

  variant2: {
    name: 'Warm Bistro',
    sections: ['hero-centered', 'about-story', 'gallery-grid', 'menu-grid', 'restaurant-quote-ribbon', 'faq-section', 'contact-info-cards', 'footer-full'],
    overrides: {
      'hero-centered': { badge: '🍽️ Fresh daily, cooked with love', headline: 'A Taste Of\nHome, Every\nSingle Time', subtext: 'Family recipes, quality ingredients, warm hospitality.', 'cta-text': 'View Menu →' },
      'gallery-grid': { headline: 'Inside Our Kitchen', subtext: 'A peek at what we serve every day.' },
      'restaurant-quote-ribbon': { quote: '"Feels like home cooking — the flavors are unmatched."', name: 'Kunle A., Regular customer' },
      'faq-section': { headline: 'Common Questions', q1: 'Do you deliver?', a1: 'Yes, we deliver across the city — order via WhatsApp.', q2: 'Can I book a table?', a2: 'Absolutely, message us to reserve.', q3: 'Do you cater events?', a3: 'Yes, contact us for catering packages.' },
      'contact-info-cards': { headline: 'Get In Touch', location: 'Lagos, Nigeria' },
    },
  },
  variant3: {
    name: 'Modern Cafe',
    sections: ['cafe-order-hero', 'cafe-menu-list', 'cafe-reviews-strip', 'contact-cta-banner', 'cafe-footer-light'],
    overrides: {
      'cafe-order-hero': {
        badge: '🔥 Trending near you',
        headline: 'Hot food, delivered fast',
        subtext: 'Order online and get it delivered hot, or pick up in minutes.',
        'cta-text': 'Order Now',
        'cta-link': '#menu',
        time: '25-35 min',
        rating: '4.8 (2,300+ reviews)',
      },
      'cafe-menu-list': {
        headline: 'Our Menu',
        tab1: 'Popular', tab2: 'Mains', tab3: 'Drinks',
        'i1-name': 'Jollof Rice Special', 'i1-desc': 'Smoky jollof with grilled chicken and plantain.', 'i1-price': '₦3,500',
        'i2-name': 'Suya Wrap', 'i2-desc': 'Spicy grilled beef wrap with fresh veggies.', 'i2-price': '₦2,800',
        'i3-name': 'Chapman', 'i3-desc': 'Classic Nigerian fruit cocktail, chilled.', 'i3-price': '₦1,500',
      },
      'cafe-reviews-strip': {
        headline: 'What people are saying',
        'r1-name': 'Chidi A.', 'r1-text': 'Best food in the area, always fresh and on time.',
        'r2-name': 'Fatima B.', 'r2-text': 'My go-to order every weekend without fail.',
        'r3-name': 'Emeka O.', 'r3-text': 'Fast delivery and the portions are always generous.',
      },
      'contact-cta-banner': {
        headline: 'Order via WhatsApp',
        subtext: 'Send us your order and we will confirm right away.',
        'cta-text': 'Chat to Order →',
      },
      'cafe-footer-light': {
        hours: 'Open daily · 9am – 10pm',
      },
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. FASHION / BOUTIQUE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'fashion_store',
  name: 'Fashion & Boutique',
  emoji: '👗',
  desc: 'Showcase clothing, accessories & lookbooks',
  palette: { S1: '#0a0a0a', S2: '#EC4899', S3: '#F97316' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['fashion-hero', 'gallery-grid', 'menu-grid', 'testimonials-cards', 'newsletter-section', 'footer-full'],
  overrides: {'fashion-hero': {'label': 'New Collection · 2025', 'headline': 'Style That\nDefines You.', 'subtext': 'Curated fashion for the bold and confident. New arrivals every week.', 'cta-text': 'SHOP THE COLLECTION'},
    'gallery-grid': {
      headline: 'Lookbook',
      subtext: 'Style inspiration for every occasion',
    },
    'menu-grid': {
      headline: 'Shop Now',
      'btn-text': 'Order via WhatsApp →',
    },
    'newsletter-section': {
      headline: 'Be First to See New Arrivals',
      subtext: 'Subscribe for early access to new drops, style guides, and exclusive offers.',
    },
    'cta-bold': {
      headline: 'Your Style,\nYour Statement.',
      'btn-text': 'Shop via WhatsApp',
    },
  },
  variant2: {
    name: 'Runway Editorial',
    sections: ['fashion-editorial-hero', 'fashion-lookbook-split', 'fashion-ig-quotes', 'newsletter-section', 'footer-full'],
    overrides: {
      'fashion-editorial-hero': {
        label: 'New Collection',
        headline: 'Style Redefined',
        'cta-text': 'Shop The Edit',
        'cta-link': '#shop',
      },
      'fashion-lookbook-split': {
        'l1-title': 'The Weekend Edit',
        'l1-desc': 'Effortless pieces for days off — comfort without compromising style.',
        'l2-title': 'Evening Essentials',
        'l2-desc': 'Statement pieces for nights that matter.',
      },
      'fashion-ig-quotes': {
        q1: 'Obsessed with the fit and fabric.', h1: '@amara.styles',
        q2: 'Fits perfectly, exactly as pictured.', h2: '@halima.wears',
        q3: 'My favorite boutique, hands down.', h3: '@preciousofficial',
      },
      'newsletter-section': { headline: 'Be First to Shop New Drops', subtext: 'Early access, style edits, and members-only pricing.', 'btn-text': 'Join the List' },
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. GROCERY / FARM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'grocery',
  name: 'Grocery / Farm',
  emoji: '🥦',
  desc: 'Fresh produce, supermarket & bulk orders',
  palette: { S1: '#052e16', S2: '#16A34A', S3: '#65A30D' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['grocery-hero', 'features-3col', 'menu-grid', 'about-story', 'contact-whatsapp', 'footer-full'],
  overrides: {'grocery-hero': {'badge': '🌿 Organic • Fresh Daily • Farm-to-Table', 'headline': 'Fresh From\nthe Farm,\nStraight to You', 'subtext': 'Organic vegetables, fruits, proteins & essentials. Order by 12pm for same-day delivery.', 'cta-text': '🛒 Order Fresh Produce', 'delivery': 'Same-day delivery available'},
    'features-3col': {
      headline: 'Why Families Love Us',
      'f1-icon': '🌱', 'f1-title': 'Farm-Fresh Daily',    'f1-desc': 'Every item is sourced fresh from our partner farms and market every single morning.',
      'f2-icon': '🚚', 'f2-title': 'Same-Day Delivery',  'f2-desc': 'Order before 12pm and receive your groceries the same day, fresh and well-packaged.',
      'f3-icon': '💰', 'f3-title': 'Best Market Prices', 'f3-desc': 'We cut out the middlemen to give you the freshest produce at the best possible prices.',
    },
    'menu-grid': {
      headline: 'Shop Fresh Produce',
      'btn-text': 'Order via WhatsApp →',
      'item1-name': 'Fresh Tomatoes (1kg)',
      'item1-desc': 'Farm-fresh, plump and ripe. Perfect for stews and soups.',
      'item1-price': '₦1,200',
      'item2-name': 'Spinach / Ugwu (bunch)',
      'item2-price': '₦600',
      'item3-name': 'Fresh Tilapia (1kg)',
      'item3-price': '₦3,500',
      'item4-name': 'Assorted Vegetables Pack',
      'item4-price': '₦2,500',
    },
  },
  variant2: {
    name: 'Weekly Box Subscription',
    sections: ['grocery-box-hero', 'grocery-plan-cards', 'grocery-family-quote', 'contact-form-split', 'grocery-footer-fresh'],
    overrides: {
      'grocery-box-hero': {
        badge: '📦 Weekly box delivery',
        headline: 'Fresh groceries, delivered weekly',
        subtext: 'Pick a box size, we handle the rest — fresh produce at your door, every week.',
        'cta-text': 'Choose Your Box',
        'cta-link': '#plans',
      },
      'grocery-plan-cards': {
        headline: 'Choose Your Box',
        'p1-name': 'Starter Box', 'p1-price': '₦8,000', 'p1-desc': 'Good for a household of 2.',
        'p2-name': 'Family Box', 'p2-price': '₦14,000', 'p2-desc': 'Good for a household of 4.',
        'p3-name': 'Bulk Box', 'p3-price': '₦22,000', 'p3-desc': 'Good for a household of 6+.',
      },
      'grocery-family-quote': { quote: '"I no longer think about groceries — it just shows up, fresh every time."', name: 'Chioma B., Subscriber since 2024' },
      'contact-form-split': { headline: 'Have a Question?', subtext: 'We\'re happy to help with your order.' },
      'grocery-footer-fresh': { hours: 'Delivering daily, 8am – 6pm' },
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. BOOKING & APPOINTMENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'booking',
  name: 'Booking & Appointments',
  emoji: '📅',
  desc: 'Salons, clinics, consultants, spas',
  palette: { S1: '#0f0f0f', S2: '#7C3AED', S3: '#6366F1' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['booking-hero', 'service-cards', 'gallery-grid', 'testimonials-cards', 'faq-section', 'contact-whatsapp', 'footer-full'],
  overrides: {'booking-hero': {'eyebrow': 'Premium Hair Studio · Lagos', 'headline': 'Where Beauty\nMeets Excellence', 'subtext': 'Award-winning stylists. Premium products. Leave feeling your absolute best.', 'cta-text': '📅 Book Appointment', 'rating': '4.9 • 500+ clients', 'slots': '3 slots available today'},
    
    'hero-minimal': {
      eyebrow: '✂️ Premium Hair Studio · Victoria Island',
      headline: 'Look Your\nAbsolute Best.\nAlways.',
      subtext: 'Award-winning stylists. Premium products. A space where you relax and leave feeling amazing.',
      'cta-text': 'Book an Appointment',
      'cta2-text': 'See Our Services',
    },
    'service-cards': {
      headline: 'Our Services',
      's1-name': 'Hair Styling & Treatment',
      's1-desc': 'Professional cut, colouring, keratin treatment, and styling by certified stylists.',
      's1-price': '₦8,000',
      's1-duration': '60–90 mins',
      's2-name': 'Full Glam Package',
      's2-desc': 'Complete makeover — hair, makeup, nails, and skincare in one session.',
      's2-price': '₦25,000',
      's3-name': 'Nail Art & Manicure',
      's3-desc': 'Gel, acrylic, or dip powder with creative designs. Long-lasting results.',
      's3-price': '₦5,000',
    },
    'testimonials-cards': {
      headline: 'Our Clients Love Us',
      't1-quote': '"I have been coming here for 2 years and the quality never drops. My hair has never been healthier. Highly recommend their keratin treatment!"',
      't2-quote': '"Booked the full glam package for my wedding. They absolutely nailed it — I felt like a queen all day. Cannot thank them enough!"',
      't3-quote': '"Best nail technician in Lagos hands down. Obsessed with my set every single time. I will not go anywhere else!"',
    },
    'faq-section': {
      q1: 'How do I book an appointment?',
      a1: 'Click "Book via WhatsApp" or send us a direct message with your name, service, and preferred date. We confirm within minutes.',
      q2: 'Do I need to pay a deposit?',
      a2: 'A 30% deposit is required to secure your appointment. This is deducted from your final bill on the day.',
      q3: 'What if I need to cancel?',
      a3: 'We ask for at least 24 hours notice. Cancellations with less notice may forfeit the deposit.',
      q4: 'Do you have parking?',
      a4: 'Yes, we have free secure parking for all clients. We are also a 5-minute walk from the nearest bus stop.',
    },
  },
  variant2: {
    name: 'Scheduling App',
    sections: ['booking-slots-hero', 'booking-calendar-grid', 'booking-benefits-check', 'booking-footer-clean'],
    overrides: {
      'booking-slots-hero': {
        headline: 'Book your appointment in seconds',
        subtext: 'Pick a time that works for you — no calls, no waiting.',
        'cta-text': 'Book Now',
        'cta-link': '#book',
        slot1: '10:00 AM', slot2: '1:30 PM ✓', slot3: '4:00 PM',
      },
      'booking-calendar-grid': {
        headline: "This Week's Availability",
        subtext: 'Green means open — tap any day to see time slots.',
      },
      'booking-benefits-check': {
        b1: 'Instant confirmation', b2: 'Automatic reminders', b3: 'Free rescheduling', b4: 'No account needed',
      },
      'booking-footer-clean': {},
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. EVENT & TICKETING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'event',
  name: 'Event & Ticketing',
  emoji: '🎟️',
  desc: 'Concerts, workshops, conferences',
  palette: { S1: '#09090b', S2: '#F97316', S3: '#EF4444' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['event-hero', 'features-3col', 'service-cards', 'gallery-grid', 'faq-section', 'contact-whatsapp', 'footer-full'],
  overrides: {'event-hero': {'tag': '🎵 Live Event · Limited Tickets', 'headline': 'The Biggest\nNight of 2025', 'date': 'December 31, 2025 • 8PM', 'venue': 'Eko Hotel & Suites, Victoria Island', 'cta-text': '🎟️ Get Your Tickets Now', 'target-date': '2025-12-31'},
    'features-3col': {
      headline: 'What to Expect',
      'f1-icon': '🎵', 'f1-title': 'Live Performances', 'f1-desc': 'Top artists and performers taking the stage for an unforgettable night.',
      'f2-icon': '🍽️', 'f2-title': 'Food & Drinks',     'f2-desc': 'Premium catering with a wide variety of food and cocktails throughout the event.',
      'f3-icon': '📸', 'f3-title': 'Photo Experiences',  'f3-desc': 'Professional photo booths and dedicated photographers to capture every moment.',
    },
    'service-cards': {
      headline: 'Ticket Options',
      's1-name': 'General Admission',
      's1-desc': 'Full access to the event, general seating area, and all public zones.',
      's1-price': '₦15,000',
      's1-duration': 'All day',
      's2-name': 'VIP Table (4 Persons)',
      's2-desc': 'Reserved table, dedicated server, premium drinks package, and priority access.',
      's2-price': '₦120,000',
      's3-name': 'VVIP Package',
      's3-desc': 'Front-row experience, meet & greet with artists, exclusive lounge, and premium gift pack.',
      's3-price': '₦250,000',
    },
    'contact-whatsapp': {
      headline: 'Book Your Tickets Today',
      subtext: 'Message us on WhatsApp to reserve your spot. Tickets sell out fast — do not miss out.',
      'btn-text': 'Reserve via WhatsApp',
    },
  },
  variant2: {
    name: 'Conference / Workshop',
    sections: ['conf-hero', 'conf-schedule', 'conf-speakers', 'contact-info-cards', 'corp-footer-formal'],
    overrides: {
      'conf-hero': {
        tag: '📅 Registration Open',
        headline: 'The Future of Business Summit',
        subtext: 'A full day of talks, workshops, and networking with industry leaders.',
        date: '📅 March 15, 2026',
        venue: '📍 Landmark Centre, Lagos',
        'cta-text': 'Register Now',
        'cta-link': '#register',
      },
      'conf-schedule': {
        headline: 'Event Schedule',
        't1-time': '9:00 AM', 't1-title': 'Opening Keynote', 't1-speaker': 'Chidi Okafor, CEO',
        't2-time': '11:00 AM', 't2-title': 'Panel: Scaling in Africa', 't2-speaker': 'Various speakers',
        't3-time': '2:00 PM', 't3-title': 'Hands-on Workshop', 't3-speaker': 'Amina Yusuf, Product Lead',
      },
      'conf-speakers': {
        headline: 'Featured Speakers',
        'p1-name': 'Chidi Okafor', 'p1-title': 'CEO, TechCo',
        'p2-name': 'Amina Yusuf', 'p2-title': 'Product Lead, Fintech Inc',
        'p3-name': 'Femi Adeyemi', 'p3-title': 'Founder, StartupHub',
      },
      'contact-info-cards': {
        headline: 'Reserve Your Spot',
        location: 'Landmark Centre, Lagos',
      },
      'corp-footer-formal': {
        headline: 'Ready to Join Us?',
        subtext: 'Registration closes one week before the event.',
        'cta-text': 'Register Now',
        'cta-link': '#register',
      },
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. HOTEL / SHORTLET
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'hotel_rental',
  name: 'Hotel / Shortlet',
  emoji: '🏨',
  desc: 'Room bookings and vacation rentals',
  palette: { S1: '#0c1a2e', S2: '#0EA5E9', S3: '#6366F1' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['hotel-hero', 'features-3col', 'gallery-grid', 'service-cards', 'testimonials-cards', 'contact-whatsapp', 'footer-full'],
  overrides: {
    'hotel-hero': {
      badge: '🏨 Luxury Shortlet · Lagos',
      headline: 'Your Home\nAway From Home',
      subtext: 'Fully furnished luxury apartments with premium amenities. Perfect for short stays, business trips, and special occasions.',
      'cta-text': 'Check Availability →',
    },
    'features-3col': {
      headline: 'Why Guests Choose Us',
      'f1-icon': '🛏️', 'f1-title': 'Fully Furnished',    'f1-desc': 'Premium furniture, fully equipped kitchen, fast Wi-Fi, and everything you need for a comfortable stay.',
      'f2-icon': '🔒', 'f2-title': 'Safe & Secure',     'f2-desc': '24/7 security, CCTV, keycard access, and dedicated concierge service for your peace of mind.',
      'f3-icon': '📍', 'f3-title': 'Prime Location',    'f3-desc': 'Located in the heart of Victoria Island, minutes from restaurants, malls, and business centres.',
    },
    'service-cards': {
      headline: 'Room Options',
      's1-name': 'Studio Apartment',
      's1-desc': 'Cosy studio perfect for solo travellers or couples. Queen bed, smart TV, full kitchen.',
      's1-price': '₦35,000',
      's1-duration': 'per night',
      's2-name': '2-Bedroom Apartment',
      's2-desc': 'Spacious 2-bed for families or groups. 2 bathrooms, dining area, and balcony with city views.',
      's2-price': '₦75,000',
      's3-name': 'Penthouse Suite',
      's3-desc': 'Ultimate luxury. Floor-to-ceiling windows, rooftop terrace, jacuzzi, and butler service.',
      's3-price': '₦150,000',
    },
  },
  variant2: {
    name: 'Resort / Poolside',
    sections: ['resort-hero', 'resort-amenities-grid', 'resort-rooms-list', 'resort-guest-quote', 'contact-cta-banner', 'grocery-footer-fresh'],
    overrides: {
      'resort-hero': {
        badge: '☀️ Book your escape',
        headline: 'Your poolside escape awaits',
        subtext: 'Relax, unwind, and enjoy resort-style comfort — right in the city.',
        rating: '⭐ 4.9 · 800+ stays',
        'cta-text': 'Check Availability',
        'cta-link': '#rooms',
      },
      'resort-amenities-grid': {
        headline: 'Everything You Need',
        a1: 'Swimming Pool', a2: 'Free Wi-Fi', a3: 'Breakfast Included', a4: 'Free Parking', a5: 'Air Conditioning', a6: 'Spa & Gym',
      },
      'resort-rooms-list': {
        headline: 'Choose Your Room',
        'r1-name': 'Garden View Room', 'r1-desc': 'Cosy room overlooking the pool garden.', 'r1-price': '₦35,000/night',
        'r2-name': 'Poolside Suite', 'r2-desc': 'Spacious suite with direct pool access.', 'r2-price': '₦65,000/night',
      },
      'resort-guest-quote': { quote: '"Exactly like the photos, spotless, and the pool was a huge bonus."', name: 'Tomiwa A.', stay: '3-night stay' },
      'contact-cta-banner': {
        headline: 'Ready to Book?',
        subtext: 'Message us for availability and instant confirmation.',
        'cta-text': 'Check Availability →',
      },
      'grocery-footer-fresh': { hours: 'Check-in from 2pm · Check-out by 11am' },
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. PORTFOLIO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'portfolio',
  name: 'Portfolio',
  emoji: '🎨',
  desc: 'Showcase your work and attract clients',
  palette: { S1: '#0a0a0a', S2: '#F97316', S3: '#FBBF24' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['portfolio-hero', 'gallery-grid', 'about-story', 'testimonials-cards', 'contact-whatsapp', 'footer-full'],
  overrides: {'portfolio-hero': {'eyebrow': 'Brand Designer & Creative Director', 'headline': 'I Design\nThings\nThat\nWork.', 'subtext': 'Brand identity, digital design, and creative direction for businesses that want to stand out.', 'cta-text': 'View My Work →', 'clients': '80+', 'years': '5yrs'},
    
    'hero-minimal': {
      eyebrow: '✦ Creative Director & Brand Designer',
      headline: 'I Create Work\nThat Gets You\nNoticed.',
      subtext: 'Brand identity, digital design, and creative strategy for businesses that want to stand out.',
      'cta-text': 'View My Work',
      'cta2-text': 'Let\'s Work Together',
    },
    'gallery-grid': {
      headline: 'Selected Projects',
      subtext: 'A curated selection of recent work',
    },
    'features-3col': {
      headline: 'What I Offer',
      'f1-icon': '🎨', 'f1-title': 'Brand Identity',   'f1-desc': 'Logo, visual language, and brand guidelines that tell your story consistently across every platform.',
      'f2-icon': '💻', 'f2-title': 'Digital Design',   'f2-desc': 'Websites, social media content, and digital campaigns designed to convert and impress.',
      'f3-icon': '📐', 'f3-title': 'Print & Packaging', 'f3-desc': 'Packaging design, marketing materials, and print-ready files for any project.',
    },
    'contact-whatsapp': {
      headline: 'Let\'s Create Something Great',
      subtext: 'Have a project in mind? I would love to hear about it. Let\'s chat.',
      'btn-text': 'Start a Project →',
    },
  },

  variant2: {
    name: 'Story First',
    sections: ['hero-minimal', 'about-story', 'gallery-grid', 'portfolio-client-logos', 'portfolio-quote-minimal', 'contact-form-split', 'footer-full'],
    overrides: {
      'hero-minimal': { eyebrow: 'Portfolio', headline: 'I Build Things\nPeople Actually\nUse', subtext: 'Designer & developer crafting clean, functional work.', 'cta-text': 'View My Work', 'cta2-text': 'Get In Touch' },
      'portfolio-client-logos': { c1: 'Paystack', c2: 'Flutterwave', c3: 'Kuda', c4: 'Andela' },
      'portfolio-quote-minimal': { quote: '"Delivered exactly what we needed, ahead of schedule."', name: 'Segun T., Startup Founder' },
      'contact-form-split': { headline: "Let's Work Together", subtext: 'Tell me about your project.' },
    },
  },
  variant3: {
    name: 'Creative Agency',
    sections: ['agency-hero', 'agency-work-grid', 'agency-process-strip', 'agency-stat-quote', 'agency-footer-bold'],
    overrides: {
      'agency-hero': {
        status: 'Available for new projects',
        headline: 'Design & code that ships.',
        subtext: 'I help brands turn ideas into fast, beautiful, working products.',
        'cta-text': 'View My Work →',
        'cta-link': '#work',
        skill1: 'Brand Design', skill2: 'Web Development', skill3: 'UI/UX', skill4: 'Motion',
      },
      'agency-work-grid': {
        headline: 'Selected Work',
        'p1-name': 'Fintech Rebrand', 'p1-tag': 'Branding',
        'p2-name': 'E-commerce Platform', 'p2-tag': 'Web App',
      },
      'agency-process-strip': {
        headline: 'How I Work',
        's1-title': 'Discovery', 's1-desc': 'Understand the goal, audience, and constraints first.',
        's2-title': 'Design & Build', 's2-desc': 'Iterate fast with real feedback loops.',
        's3-title': 'Launch & Support', 's3-desc': 'Ship it, then stick around to refine it.',
      },
      'agency-stat-quote': { stat: '30+', 'stat-lbl': 'Projects shipped', quote: '"Rare mix of great design instincts and solid engineering."', name: 'Client, Product Lead' },
      'agency-footer-bold': {
        headline: "Let's build something great.",
        'cta-text': 'Get In Touch →',
        'cta-link': '#contact',
      },
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. GIG MARKETPLACE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'gig_marketplace',
  name: 'Gig Marketplace',
  emoji: '💼',
  desc: 'Freelance services and skill marketplace',
  palette: { S1: '#0f0f1a', S2: '#7C3AED', S3: '#06B6D4' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['gig-hero', 'service-cards', 'features-3col', 'testimonials-cards', 'faq-section', 'contact-whatsapp', 'footer-full'],
  overrides: {
    'gig-hero': {
      badge: '💼 Top-rated freelancers · Verified skills',
      headline: 'Get Your Work\nDone by Experts',
      subtext: 'Connect with vetted Nigerian freelancers for design, tech, writing, marketing, and more.',
      'cta-text': 'Browse Services →',
    },
    'service-cards': {
      headline: 'Popular Services',
      's1-name': 'Logo & Brand Design',
      's1-desc': 'Professional logos, brand identity, and visual design by expert creatives.',
      's1-price': 'From ₦15,000',
      's1-duration': '2–5 days',
      's2-name': 'Website Development',
      's2-desc': 'Fast, mobile-responsive websites built with modern technologies by verified developers.',
      's2-price': 'From ₦80,000',
      's3-name': 'Social Media Management',
      's3-desc': 'Content creation, scheduling, and community management to grow your online presence.',
      's3-price': 'From ₦25,000',
    },
  },
  variant2: {
    name: 'Talent Roster',
    sections: ['talent-hero', 'talent-profiles-grid', 'gig-client-quote', 'contact-info-cards', 'booking-footer-clean'],
    overrides: {
      'talent-hero': {
        headline: 'Find the right expert, fast',
        subtext: 'Vetted freelancers ready to start today.',
        'search-ph': 'Search skills, e.g. logo design...',
        tag1: 'Web Design', tag2: 'Copywriting', tag3: 'Video Editing',
      },
      'talent-profiles-grid': {
        headline: 'Top-Rated Talent',
        'p1-name': 'Ada N.', 'p1-role': 'Brand Designer', 'p1-rate': 'From ₦15,000',
        'p2-name': 'Kelvin O.', 'p2-role': 'Web Developer', 'p2-rate': 'From ₦80,000',
        'p3-name': 'Zainab M.', 'p3-role': 'Content Writer', 'p3-rate': 'From ₦10,000',
      },
      'gig-client-quote': {
        stat: '98%',
        quote: '"Client satisfaction rate — because every freelancer here is vetted before they are listed."',
        name: 'Based on completed projects',
      },
      'contact-info-cards': {
        headline: 'Need Something Custom?',
        location: 'Remote & Lagos-based',
      },
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 11. MICROWORKER / TASK BOARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'microworker',
  name: 'Task Board',
  emoji: '⚡',
  desc: 'Micro-tasks, bounties & surveys',
  palette: { S1: '#0f172a', S2: '#F59E0B', S3: '#EF4444' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['microwork-hero', 'service-cards', 'features-3col', 'faq-section', 'contact-whatsapp', 'footer-full'],
  overrides: {
    'microwork-hero': {
      badge: '⚡ Earn money doing simple online tasks',
      headline: 'Complete Tasks.\nEarn Real Money.',
      subtext: 'Join thousands of Nigerians earning extra income by completing simple tasks from anywhere.',
      'cta-text': 'Start Earning Today →',
    },
    'service-cards': {
      headline: 'Available Task Types',
      's1-name': 'Survey & Research',
      's1-desc': 'Complete surveys and market research for businesses. Quick, easy, well-paid.',
      's1-price': '₦500 – ₦2,000',
      's1-duration': '5–15 mins',
      's2-name': 'Data Entry & Review',
      's2-desc': 'Help businesses organise and verify data. Flexible hours, work from anywhere.',
      's2-price': '₦1,000 – ₦5,000',
      's3-name': 'App & Website Testing',
      's3-desc': 'Test digital products and provide feedback. Paid per task completed.',
      's3-price': '₦2,000 – ₦8,000',
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 12. JOB BOARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'job_board',
  name: 'Job Board',
  emoji: '📋',
  desc: 'Post jobs and accept applications',
  palette: { S1: '#0a192f', S2: '#3B82F6', S3: '#06B6D4' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['jobboard-hero', 'features-3col', 'service-cards', 'about-story', 'contact-whatsapp', 'footer-full'],
  overrides: {
    'jobboard-hero': {
      badge: '📋 New jobs added weekly',
      headline: 'Find Your Next\nBig Opportunity',
      subtext: 'Connecting talented Nigerians with the best companies across every industry.',
      'cta-text': 'Browse Open Positions →',
    },
    'features-3col': {
      headline: 'Why Use Our Job Board',
      'f1-icon': '✅', 'f1-title': 'Verified Companies',  'f1-desc': 'Every employer is manually verified. No fake listings, no scams — ever.',
      'f2-icon': '⚡', 'f2-title': 'Fast Applications',   'f2-desc': 'Apply in under 2 minutes via WhatsApp or email. No complex forms.',
      'f3-icon': '🎯', 'f3-title': 'Matched to Your Skills','f3-desc': 'Jobs are categorised by industry and skill level so you find the right fit faster.',
    },
    'service-cards': {
      headline: 'Open Positions',
      's1-name': 'Senior Marketing Manager',
      's1-desc': 'Leading FMCG brand seeking an experienced marketing manager to drive brand growth.',
      's1-price': '₦350,000+/mo',
      's1-duration': 'Full-time · Lagos',
      's2-name': 'Frontend Developer',
      's2-desc': 'Fast-growing fintech hiring a React developer. Competitive salary and equity.',
      's2-price': '₦250,000+/mo',
      's3-name': 'Content Creator',
      's3-desc': 'Media company looking for a creative content creator with strong social media skills.',
      's3-price': '₦150,000/mo',
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 13. BIO / LINK-IN-BIO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'bio_page',
  name: 'Bio / Link-in-Bio',
  emoji: '🔗',
  desc: 'All your links in one beautiful page',
  palette: { S1: '#0f0f1a', S2: '#7C3AED', S3: '#6366F1' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['bio-profile'],
  overrides: {
    'bio-profile': {
      name: 'Your Name Here',
      handle: '@yourhandle · Creator & Entrepreneur 🇳🇬',
      bio: 'Sharing what I know and love. 💫 Links below ↓',
      'l1-text': '🛍️ Shop My Products',
      'l2-text': '📸 Instagram',
      'l3-text': '▶️ YouTube',
      'l4-text': '💬 Book a Session',
      'l5-text': '🤝 Work With Me',
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 14. LANDING PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'landing_page',
  name: 'Landing Page',
  emoji: '🚀',
  desc: 'Campaigns, lead capture, promotions',
  palette: { S1: '#0f0f0f', S2: '#7C3AED', S3: '#F97316' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['landing-hero', 'features-3col', 'about-story', 'testimonials-cards', 'faq-section', 'newsletter-section', 'cta-bold', 'footer-full'],
  overrides: {
    'landing-hero': {
      badge: '🚀 Limited time offer — ends soon',
      headline: 'The Opportunity\nYou Have Been\nWaiting For',
      subtext: 'Join thousands of people who have already changed their lives with this programme.',
      'cta-text': 'Claim Your Spot Now →',
    },
    'newsletter-section': {
      headline: 'Get Free Updates & Bonuses',
      subtext: 'Subscribe to stay informed about upcoming launches and get exclusive early access.',
    },
    'cta-bold': {
      headline: 'Don\'t Miss Out.\nSpots Are Filling Fast.',
      'btn-text': 'Get Started Today →',
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 15. BLOG / MAGAZINE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'blog',
  name: 'Blog / Magazine',
  emoji: '✍️',
  desc: 'Articles, news and content publishing',
  palette: { S1: '#ffffff', S2: '#0f0f0f', S3: '#F97316' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['hero-minimal', 'gallery-grid', 'about-story', 'newsletter-section', 'footer-full'],
  overrides: {
    'hero-minimal': {
      eyebrow: '✍️ Stories, ideas & insights',
      headline: 'Ideas Worth\nReading. Stories\nWorth Sharing.',
      subtext: 'Fresh perspectives on business, culture, technology, and life in Nigeria. Published weekly.',
      'cta-text': 'Read Latest Articles',
      'cta2-text': 'Subscribe',
    },
    'newsletter-section': {
      headline: 'Never Miss an Article',
      subtext: 'Get our best stories delivered to your inbox every week. Join 10,000+ readers.',
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 16. MEMBERSHIP / COURSES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'membership',
  name: 'Membership & Courses',
  emoji: '🎓',
  desc: 'Gated content, courses & subscriptions',
  palette: { S1: '#0f172a', S2: '#7C3AED', S3: '#06B6D4' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['membership-hero', 'service-cards', 'features-3col', 'about-story', 'testimonials-cards', 'faq-section', 'cta-bold', 'footer-full'],
  overrides: {'membership-hero': {'badge': '🎓 Join 3,000+ successful students', 'headline': 'Learn Skills That\nActually Pay You', 'subtext': 'Practical, no-nonsense courses taught by real practitioners with real results.', 'cta-text': 'Enrol Now →', 'cta-link': '#courses', 'course-name': 'Business Fundamentals'},
    'service-cards': {
      headline: 'Our Programmes',
      's1-name': 'Business Fundamentals',
      's1-desc': 'Launch and grow a profitable business from scratch. 12-week intensive programme.',
      's1-price': '₦45,000',
      's1-duration': '12 weeks',
      's2-name': 'Digital Marketing Mastery',
      's2-desc': 'Learn social media, SEO, email, and paid advertising to grow any business online.',
      's2-price': '₦65,000',
      's3-name': 'Financial Freedom Blueprint',
      's3-desc': 'Take control of your money. Investment strategies, savings, and wealth building.',
      's3-price': '₦35,000',
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 17. REAL ESTATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'real_estate',
  name: 'Real Estate Listings',
  emoji: '🏠',
  desc: 'Buy, rent & shortlet properties',
  palette: { S1: '#0f1923', S2: '#0EA5E9', S3: '#7C3AED' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['realestate-hero', 'property-cards', 'features-3col', 'about-story', 'testimonials-cards', 'faq-section', 'contact-whatsapp', 'footer-full'],
  overrides: {'realestate-hero': {'headline': 'Find Your Perfect Property\nin Nigeria', 'subtext': 'Verified listings. Trusted agents. Your dream home is one click away.', 'stat1-n': '500+', 'stat1-l': 'Verified Listings', 'stat2-n': '50+', 'stat2-l': 'Trusted Agents', 'stat3-n': '1,000+', 'stat3-l': 'Happy Families'},
    'features-3col': {
      headline: 'Why Use Our Platform',
      'f1-icon': '✅', 'f1-title': 'Verified Listings',  'f1-desc': 'Every property is physically inspected and verified by our team before listing.',
      'f2-icon': '🤝', 'f2-title': 'Trusted Agents',   'f2-desc': 'All our agents are licensed and background-checked for your complete peace of mind.',
      'f3-icon': '💬', 'f3-title': 'WhatsApp Support', 'f3-desc': 'Connect directly with the agent on WhatsApp to schedule viewings and get answers fast.',
    },
    'contact-whatsapp': {
      headline: 'Looking for a Specific Property?',
      subtext: 'Tell us what you need and we will find the best options for your budget and location.',
      'btn-text': 'Send Property Request →',
    },
  },

  variant2: {
    name: 'Agent Spotlight',
    sections: ['hero-centered', 'about-story', 'property-cards', 'features-3col', 'gallery-grid', 'realestate-client-quotes', 'contact-cta-banner', 'footer-full'],
    overrides: {
      'hero-centered': { badge: '🏠 Lagos & Abuja specialists', headline: 'Property Deals\nYou Can Actually\nTrust', subtext: 'Verified listings, honest agents, zero stories.', 'cta-text': 'View Listings →' },
      'gallery-grid': { headline: 'Recently Sold & Let', subtext: 'A look at properties we have handled.' },
      'realestate-client-quotes': {
        headline: 'What clients say',
        q1: 'Found us the perfect home within two weeks.', n1: 'Grace O.',
        q2: 'Honest agents, no hidden fees.', n2: 'Yusuf B.',
      },
      'contact-cta-banner': { headline: 'Looking for a Property?', subtext: 'Tell us your budget and location.', 'cta-text': 'Send Request →' },
    },
  },
  variant3: {
    name: 'Luxury Listings',
    sections: ['realestate-luxury-hero', 'luxury-features-strip', 'realestate-listing-rows', 'luxury-quote-testimonial', 'contact-address-focus', 'luxury-footer-minimal'],
    overrides: {
      'realestate-luxury-hero': {
        eyebrow: 'Exceptional Properties',
        headline: 'Homes that feel like a destination',
        subtext: 'Curated listings for discerning buyers and tenants across the city.',
        'cta-text': 'View Listings',
        'cta-link': '#listings',
        stat1: '150+', 'stat1-lbl': 'Properties sold',
        stat2: '12yrs', 'stat2-lbl': 'In business',
      },
      'luxury-features-strip': {
        'f1-icon': '🔑', 'f1-title': 'Verified Ownership',
        'f2-icon': '🛡️', 'f2-title': 'Legal Support',
        'f3-icon': '🏆', 'f3-title': 'Award-Winning Agents',
        'f4-icon': '📍', 'f4-title': 'Prime Locations',
      },
      'realestate-listing-rows': {
        headline: 'Current Listings',
        'r1-name': '4 Bed Detached Duplex', 'r1-loc': 'Lekki Phase 1', 'r1-price': '₦85,000,000', 'r1-tag': 'For Sale',
        'r2-name': '3 Bed Terrace', 'r2-loc': 'Ikoyi', 'r2-price': '₦2.4M/yr', 'r2-tag': 'For Rent',
        'r3-name': 'Luxury Shortlet Studio', 'r3-loc': 'Victoria Island', 'r3-price': '₦45k/night', 'r3-tag': 'Shortlet',
      },
      'luxury-quote-testimonial': {
        quote: 'They made finding our home feel effortless — professional from the first call to the final signature.',
        name: 'Adaeze O.',
        role: 'Homeowner, Lekki',
      },
      'contact-address-focus': {
        headline: 'Looking for Something Specific?',
        address: 'Victoria Island, Lagos',
        hours: 'By appointment, Mon–Sat',
      },
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 18. COMMUNITY / FORUM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'community',
  name: 'Community / Forum',
  emoji: '👥',
  desc: 'Discussion groups and alumni networks',
  palette: { S1: '#0f0f0f', S2: '#7C3AED', S3: '#06B6D4' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['community-hero', 'features-3col', 'about-story', 'testimonials-cards', 'newsletter-section', 'cta-bold', 'footer-full'],
  overrides: {
    'community-hero': {
      badge: '👥 2,400+ active members',
      headline: 'Join a Community\nThat Actually\nSupports You',
      subtext: 'Connect with like-minded people, share knowledge, and grow together.',
      'cta-text': 'Join the Community →',
    },
    'features-3col': {
      headline: 'What You Get',
      'f1-icon': '💬', 'f1-title': 'Discussion Forums',   'f1-desc': 'Ask questions, share ideas, and get answers from experienced members and mentors.',
      'f2-icon': '📚', 'f2-title': 'Resource Library',   'f2-desc': 'Access a growing library of guides, templates, and tools exclusively for members.',
      'f3-icon': '🌐', 'f3-title': 'Networking Events', 'f3-desc': 'Monthly virtual and in-person meetups to connect with members and expand your network.',
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 19. DONATION / NGO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'donation',
  name: 'Donation & NGO',
  emoji: '❤️',
  desc: 'Charity campaigns and fundraising',
  palette: { S1: '#1a0000', S2: '#EF4444', S3: '#F97316' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['ngo-hero', 'features-3col', 'about-story', 'gallery-grid', 'testimonials-cards', 'contact-whatsapp', 'footer-full'],
  overrides: {'ngo-hero': {'cause': '❤️ Education for Every Child', 'headline': 'Every Child\nDeserves a\nFuture.', 'subtext': 'Your donation funds school fees, books, and meals for underprivileged children.', 'raised': '₦4.5M', 'goal': '₦7M', 'donors': '320', 'progress': '65', 'cta-text': '❤️ Donate Now'},
    'features-3col': {
      headline: 'Our Impact in Numbers',
      'f1-icon': '👶', 'f1-title': '5,000+ Children Helped', 'f1-desc': 'Provided education, meals, and healthcare to underprivileged children across Nigeria.',
      'f2-icon': '🏫', 'f2-title': '30 Schools Built',     'f2-desc': 'Constructed and equipped 30 schools in underserved communities since our founding.',
      'f3-icon': '💊', 'f3-title': '50,000 Medical Aids', 'f3-desc': 'Distributed free medications and ran health camps reaching over 50,000 beneficiaries.',
    },
    'contact-whatsapp': {
      headline: 'Want to Get Involved?',
      subtext: 'Donate, volunteer, or partner with us. Every way of helping makes a real difference.',
      'btn-text': 'Contact Us on WhatsApp',
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 20. CHURCH / RELIGIOUS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'church',
  name: 'Church / Religious',
  emoji: '🙏',
  desc: 'Services, giving, events and sermons',
  palette: { S1: '#0c0a1e', S2: '#7C3AED', S3: '#F59E0B' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['church-hero', 'service-cards', 'about-story', 'testimonials-cards', 'contact-whatsapp', 'footer-full'],
  overrides: {'church-hero': {'welcome': 'You Are Welcome Here', 'church-name': 'House of Grace\nInternational Church', 'tagline': 'A place of faith, love, and community. Come as you are.', 'sunday-time': '9:00am & 11:00am', 'midweek-time': 'Wednesday 6:00pm', 'location': 'Lekki Phase 1, Lagos', 'cta-text': 'Join Us This Sunday'},
    'service-cards': {
      headline: 'Service Schedule',
      's1-name': 'Sunday Service',
      's1-desc': 'Our main weekly service. Powerful worship, inspiring messages, and warm fellowship.',
      's1-price': 'Free Entry',
      's1-duration': '9am & 11am',
      's2-name': 'Midweek Bible Study',
      's2-desc': 'Deep dive into the Word every Wednesday. Perfect for growing in your faith.',
      's2-price': 'Free Entry',
      's3-name': 'Youth Service',
      's3-desc': 'A dynamic service specifically designed for young people aged 13–30. Every Saturday.',
      's3-price': 'Free Entry',
    },
    'contact-whatsapp': {
      headline: 'We Would Love to Meet You',
      subtext: 'Have questions? Want to know more? Reach out — our team is always ready to welcome you.',
      'btn-text': 'Message Us on WhatsApp',
    },
  },
},

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 21. GENERAL BUSINESS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  id: 'general_business',
  name: 'General Business',
  emoji: '🏢',
  desc: 'Professional website for any business',
  palette: { S1: '#0f0f0f', S2: '#7C3AED', S3: '#6366F1' },
  fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
  sections: ['biz-hero', 'features-3col', 'about-story', 'gallery-grid', 'testimonials-cards', 'faq-section', 'contact-whatsapp', 'footer-full'],
  overrides: {
    'biz-hero': {
      badge: '✦ Trusted by 500+ clients',
      headline: 'We Help Your\nBusiness Grow\nOnline',
      subtext: 'Professional services delivered with care, expertise, and a commitment to your success.',
      'cta-text': 'Get a Free Quote',
      'cta2-text': 'View Our Work',
    },
    'features-3col': {
      headline: 'What We Do Best',
    },
    'contact-whatsapp': {
      headline: 'Ready to Work Together?',
      subtext: 'Tell us about your project and we will get back to you with a tailored solution.',
      'btn-text': 'Start the Conversation',
    },
  },

  variant2: {
    name: 'Services Focus',
    sections: ['hero-centered', 'biz-values-row', 'about-story', 'gallery-grid', 'newsletter-section', 'contact-info-cards', 'footer-full'],
    overrides: {
      'hero-centered': { badge: '✦ Trusted by 500+ clients', headline: 'Professional\nServices, Done\nRight', subtext: 'We handle the details so you can focus on what matters.', 'cta-text': 'Get a Free Quote →' },
      'biz-values-row': { v1: 'Reliability', v2: 'Transparency', v3: 'Speed', v4: 'Craftsmanship' },
      'contact-info-cards': { headline: 'Let\'s Discuss Your Project', location: 'Lagos, Nigeria' },
      'newsletter-section': { headline: 'Stay In The Loop', subtext: 'Tips and updates, straight to your inbox.', 'btn-text': 'Subscribe' },
    },
  },
  variant3: {
    name: 'Corporate Trust',
    sections: ['corp-hero-split', 'corp-stats-band', 'corp-case-quote', 'corp-footer-formal'],
    overrides: {
      'corp-hero-split': {
        eyebrow: 'Trusted Since 2014',
        headline: 'Reliable solutions for growing businesses',
        subtext: 'We partner with businesses to deliver measurable results, on time, every time.',
        'cta-text': 'Request a Quote',
        'cta-link': '#contact',
      },
      'corp-stats-band': {
        stat1: '500+', 'stat1-lbl': 'Clients served',
        stat2: '12', 'stat2-lbl': 'Years in business',
        stat3: '98%', 'stat3-lbl': 'Client retention',
        stat4: '24/7', 'stat4-lbl': 'Support available',
      },
      'corp-case-quote': { result: '+40%', quote: '"Working with them increased our efficiency significantly within the first quarter."', name: 'Michael T., Managing Director' },
      'corp-footer-formal': {
        headline: 'Ready to get started?',
        subtext: "Let's talk about how we can help your business grow.",
        'cta-text': 'Contact Us',
        'cta-link': '#contact',
      },
    },
  },
},

]; // end ECO_TEMPLATES

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

/** Get a template by site type ID */
window.getEcoTemplate = function (typeId) {
  return window.ECO_TEMPLATES.find(t => t.id === typeId) || window.ECO_TEMPLATES.find(t => t.id === 'general_business');
};

// Style variants — same list as the dashboard's create-site style picker (ecosystem.html).
// Layered on top of a category template's own palette so sites in the same category
// don't all end up looking identical.
window.ECO_STYLE_THEMES = [
  { id: 'vibrant', name: 'Vibrant', S1: '#0f0f1a', S2: '#7C3AED', S3: '#F97316', heading: 'Plus Jakarta Sans', body: 'Inter' },
  { id: 'warm',    name: 'Warm',    S1: '#1a1410', S2: '#F97316', S3: '#EF4444', heading: 'Playfair Display',  body: 'Inter' },
  { id: 'minimal', name: 'Minimal', S1: '#0f0f0f', S2: '#111827', S3: '#6B7280', heading: 'Inter',             body: 'Inter' },
  { id: 'ocean',   name: 'Ocean',   S1: '#0c1e2e', S2: '#0EA5E9', S3: '#14B8A6', heading: 'Plus Jakarta Sans', body: 'Inter' },
  { id: 'rose',    name: 'Rose',    S1: '#1a0f14', S2: '#EC4899', S3: '#8B5CF6', heading: 'Poppins',           body: 'Inter' },
];
window.getEcoStyleTheme = function (styleId) {
  return window.ECO_STYLE_THEMES.find(s => s.id === styleId) || null;
};

/**
 * Build a full page config from a template.
 * Returns the JSON config object ready to be saved as site.config.
 * 
 * @param {string} typeId   - Site type (e.g. 'restaurant')
 * @param {string} siteName - User's chosen site name
 * @param {string} waNumber - WhatsApp number (optional)
 * @param {string} email    - Email address (optional)
 */
window.buildConfigFromTemplate = function (typeId, siteName, waNumber, email) {
  const tmpl = window.getEcoTemplate(typeId);
  if (!tmpl) return null;

  // Build sections array with field overrides applied
  const sections = tmpl.sections.map(sectionId => {
    const sec = window.getEcoSectionById(sectionId);
    if (!sec) return null;

    const overrides = tmpl.overrides?.[sectionId] || {};

    // Clone HTML and apply overrides
    let html = sec.html;

    // Apply field overrides to the HTML
    Object.entries(overrides).forEach(([fieldKey, value]) => {
      // Replace content of elements with data-f matching fieldKey
      const safeParts = fieldKey.replace(/[\[\]"]/g, '').trim();
      // We store overrides in the config — the builder applies them on render
    });

    return {
      id: sectionId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      sectionId,
      fields: {
        ...overrides,
        // Auto-inject WhatsApp and email if provided
        ...(waNumber ? { 'wa-number': waNumber, 'wa-link': 'https://wa.me/' + waNumber.replace(/\D/g, '') } : {}),
        ...(email    ? { email: 'mailto:' + email } : {}),
      },
    };
  }).filter(Boolean);

  return {
    theme: {
      primaryColor: tmpl.palette.S2,
      accentColor:  tmpl.palette.S3,
      bgColor:      tmpl.palette.S1,
      fontHeading:  tmpl.fonts.heading,
      fontBody:     tmpl.fonts.body,
    },
    settings: {
      siteName,
      siteDescription: tmpl.desc,
      logo: '',
      favicon: '',
      whatsapp: waNumber || '',
      email:    email    || '',
      socialLinks: {},
    },
    sections,
    cssVars: {
      '--S1': tmpl.palette.S1,
      '--S2': tmpl.palette.S2,
      '--S3': tmpl.palette.S3,
      '--HF': `'${tmpl.fonts.heading}', sans-serif`,
      '--BF': `'${tmpl.fonts.body}', sans-serif`,
    },
  };
};

/**
 * Render a full page HTML from a site config.
 * Used by the server renderer and the iframe preview.
 * 
 * @param {object} config  - Site config from buildConfigFromTemplate
 * @param {string} siteId  - Site ID (for analytics)
 * @returns {string}       - Complete HTML page
 */
window.renderSiteFromConfig = function (config, siteId) {
  if (!config || !config.sections) return '<p>No sections found.</p>';

  const cv    = config.cssVars   || {};
  const theme = config.theme     || {};
  const sett  = config.settings  || {};

  const cssVarStr = Object.entries(cv).map(([k, v]) => `${k}:${v}`).join(';');

  const sectionsHTML = config.sections.map(sec => {
    const secDef = window.getEcoSectionById(sec.sectionId);
    if (!secDef) return `<!-- missing section: ${sec.sectionId} -->`;

    let html = secDef.html;
    const fields = sec.fields || {};

    // Apply field overrides to the section HTML
    Object.entries(fields).forEach(([key, value]) => {
      if (!value) return;
      const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Apply text overrides
      const dataFRegex = new RegExp(`(data-f="${key}"[^>]*contenteditable="false"[^>]*>)([^<]*)(<)`, 'g');
      html = html.replace(dataFRegex, `$1${String(value).replace(/</g,'&lt;').replace(/>/g,'&gt;')}$3`);
      // Apply href overrides for link fields
      if (key.endsWith('-link') || key === 'email' || key === 'wa-number' || key === 'wa-link') {
        const hrefRegex = new RegExp(`(data-f="${key}"[^>]*)href="[^"]*"`, 'g');
        html = html.replace(hrefRegex, `$1href="${String(value).replace(/"/g, '&quot;')}"`);
      }
      // Apply src overrides for image fields
      if (secDef.fields.find(f => f.k === `[data-f="${key}"]` && f.t === 'image')) {
        const srcRegex = new RegExp(`(data-f="${key}"[^>]*)src="[^"]*"`, 'g');
        html = html.replace(srcRegex, `$1src="${String(value).replace(/"/g, '&quot;')}"`);
      }
    });

    return html;
  }).join('\n');

  const hFont = theme.fontHeading || 'Plus Jakarta Sans';
  const bFont = theme.fontBody    || 'Inter';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${(sett.siteName || 'My Site').replace(/</g,'&lt;')}</title>
<meta name="description" content="${(sett.siteDescription || '').replace(/"/g,'&quot;')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(hFont)}:wght@400;600;700;800;900&family=${encodeURIComponent(bFont)}:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{${cssVarStr};}
html,body{font-family:var(--BF,'Inter'),sans-serif;color:#0f0f0f;background:var(--S1,#fff);-webkit-font-smoothing:antialiased;}
img{max-width:100%;display:block;}
a{color:inherit;}
button{cursor:pointer;}
input,textarea,select{font-family:inherit;}
</style>
</head>
<body>
${sectionsHTML}
</body>
</html>`;
};

})(); // end IIFE
