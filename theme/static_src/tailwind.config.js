/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: [
        // Templates within theme app (e.g. base.html)
        '../templates/**/*.html',
        // Templates in other apps
        '../../templates/**/*.html',
        // Ignore files in node_modules
        '!../../**/node_modules',
        // Include JavaScript files that might contain Tailwind CSS classes
        '../../**/*.js',
        // Include Python files that might contain Tailwind CSS classes
        '../../**/*.py',
        // Include flowbite files
        "./node_modules/flowbite/**/*.js"
    ],
    safelist: [
    'grid-cols-2',
    'grid-cols-3',
    'grid-cols-4',
    'grid-cols-5',
    'grid-cols-6',
    'place-items-center',
  ],
      theme: {
    extend: {
      colors: {
        primary: {"50":"#eff6ff","100":"#dbeafe","200":"#bfdbfe","300":"#93c5fd","400":"#60a5fa","500":"#3b82f6","600":"#2563eb","700":"#1d4ed8","800":"#1e40af","900":"#1e3a8a","950":"#172554"}
      }
    },
    fontFamily: {
      'body': [
    'Inter',
    'ui-sans-serif',
    'system-ui',
    '-apple-system',
    'system-ui',
    'Segoe UI',
    'Roboto',
    'Helvetica Neue',
    'Arial',
    'Noto Sans',
    'sans-serif',
    'Apple Color Emoji',
    'Segoe UI Emoji',
    'Segoe UI Symbol',
    'Noto Color Emoji'
  ],
      'sans': [
    'Inter',
    'ui-sans-serif',
    'system-ui',
    '-apple-system',
    'system-ui',
    'Segoe UI',
    'Roboto',
    'Helvetica Neue',
    'Arial',
    'Noto Sans',
    'sans-serif',
    'Apple Color Emoji',
    'Segoe UI Emoji',
    'Segoe UI Symbol',
    'Noto Color Emoji'
  ]
    }
  },
      plugins: [
          require('flowbite/plugin-windicss'),
          require('@tailwindcss/forms'),
          require('@tailwindcss/typography'),
          require('@tailwindcss/aspect-ratio')
      ],
    }
