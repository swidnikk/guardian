// Bundled by esbuild into one classic script (assets/vendor/md.js) so it works from file:// (no ES-module loading, no CDN).
import '@material/web/checkbox/checkbox.js';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/button/text-button.js';
import '@material/web/button/filled-tonal-button.js';
import '@material/web/divider/divider.js';
import { styles as typescaleStyles } from '@material/web/typography/md-typescale-styles.js';
if (typescaleStyles && typescaleStyles.styleSheet) document.adoptedStyleSheets = [...document.adoptedStyleSheets, typescaleStyles.styleSheet];
