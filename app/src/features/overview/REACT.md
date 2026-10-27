# Static zoom in React

Standing order 18 and origin/codex/static-zoom at e88fe1c are authoritative.
The React scene renders original content at the saved world positions and dimensions multiplied by camera scale.
There is no React overview component, summary tier, cluster tier, repacking or return-view control.
Only more than 400 visible cards below zoom 0.4 may use exact canvas rectangles.

The existing JavaScript files in this folder remain because the default legacy controller imports them.
The static-zoom branch removes that implementation and its imports together.
Do not register those files in React composition or recreate their former assertions.
The geometry, link, editor-reference and content assertions in the rewritten suites remain owned by their corresponding scene, chrome, document and data features.
