// App modules imported by unit tests carry Vite stylesheet imports. Vite bundles them; Node tests ignore them.
declare module '*.css' {}
