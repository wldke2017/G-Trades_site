# Syntax Error Fix - botState Duplicate Declaration

## Error
```
Uncaught SyntaxError: Identifier 'botState' has already been declared (at app.js:1:1)
```

## Root Cause
The `botState` variable was declared in **two places**:
1. **ghost_ai_bot.js** (line 17): `const botState = {...}`
2. **app.js** (line 77): `let botState = {...}`

Since the script loading order in `index.html` is:
```html
<script src="ghost_ai_bot.js"></script>
<script src="app.js"></script>
```

When `app.js` loads, `botState` is already in the global scope from `ghost_ai_bot.js`, causing the duplicate declaration error.

## Fix Applied
Removed the duplicate declaration from `app.js` (lines 77-100) and replaced with a comment noting that `botState` is declared in `ghost_ai_bot.js`.

**Before:**
```javascript
// --- Ghost AI Bot State ---
let botState = {
    activeSymbol: null,
    recoverySymbol: null,
    // ... 20+ properties ...
};
```

**After:**
```javascript
// --- Ghost AI Bot State ---
// NOTE: botState is declared in ghost_ai_bot.js (loaded before app.js)
// Do not redeclare here - causes "Identifier 'botState' has already been declared" error
```

## Result
The syntax error is now resolved. The application should load without JavaScript errors.

## Testing
1. Refresh the page
2. Open browser console (F12)
3. Verify no "SyntaxError" appears
4. All bot functionality should work normally