// AI Strategy Mobile - Card Toggle Functionality
// Handles collapsible cards for better space management

document.addEventListener('DOMContentLoaded', () => {
    initializeAICardToggles();
});

function initializeAICardToggles() {
    // Add card structure to existing AI Strategy sections
    wrapSectionsInCards();

    // Add toggle functionality
    const cardHeaders = document.querySelectorAll('.ai-card-header');
    cardHeaders.forEach(header => {
        header.addEventListener('click', toggleCard);
    });

    // Load saved collapse states from localStorage
    loadCardStates();
}

function wrapSectionsInCards() {
    // Wrap prompt input in card
    const promptSection = document.querySelector('.ai-input-group');
    if (promptSection && !promptSection.closest('.ai-card')) {
        wrapInCard(promptSection, '📝 Strategy Prompt', 'ai-prompt-card', false);
    }

    // Wrap parameters in card
    const paramsGrid = document.querySelector('.ai-parameters-grid');
    if (paramsGrid && !paramsGrid.closest('.ai-card')) {
        wrapInCard(paramsGrid.parentElement, '⚙️ Parameters', 'ai-params-card', true);
    }

    // Wrap market selector in card
    const marketSelector = document.querySelector('.ai-market-selector-wrapper');
    if (marketSelector && !marketSelector.closest('.ai-card')) {
        wrapInCard(marketSelector, '🎯 Markets', 'ai-markets-card', true);
    }

    // Wrap strategy controls in card
    const strategyControls = document.querySelector('.ai-strategy-controls');
    if (strategyControls && !strategyControls.closest('.ai-card')) {
        wrapInCard(strategyControls, '💾 Saved Strategies', 'ai-saved-card', true);
    }

    // Wrap code editor in card
    const editorSection = document.querySelector('.ai-editor-section');
    if (editorSection && !editorSection.closest('.ai-card')) {
        wrapInCard(editorSection, '</> Code Editor', 'ai-editor-card', false);
    }

    // Wrap logs in card
    const logsSection = document.querySelector('.ai-logs-section');
    if (logsSection && !logsSection.closest('.ai-card')) {
        wrapInCard(logsSection, '📜 Live Logs', 'ai-logs-card', true);
    }
}

function wrapInCard(element, title, cardId, startCollapsed = false) {
    // Create card wrapper
    const card = document.createElement('div');
    card.className = `ai-card ${startCollapsed ? 'collapsed' : ''}`;
    card.id = cardId;

    // Create card header
    const header = document.createElement('div');
    header.className = 'ai-card-header';
    header.innerHTML = `
        <h4>${title}</h4>
        <span class="ai-card-toggle">▼</span>
    `;

    // Create card body
    const body = document.createElement('div');
    body.className = 'ai-card-body';

    // Insert card before element
    element.parentNode.insertBefore(card, element);

    // Move element into card body
    body.appendChild(element);

    // Assemble card
    card.appendChild(header);
    card.appendChild(body);
}

function toggleCard(event) {
    const header = event.currentTarget;
    const card = header.closest('.ai-card');

    if (!card) return;

    // Toggle collapsed class
    card.classList.toggle('collapsed');

    // Save state
    saveCardState(card.id, card.classList.contains('collapsed'));
}

function saveCardState(cardId, isCollapsed) {
    if (!cardId) return;

    const states = JSON.parse(localStorage.getItem('aiCardStates') || '{}');
    states[cardId] = isCollapsed;
    localStorage.setItem('aiCardStates', JSON.stringify(states));
}

function loadCardStates() {
    const states = JSON.parse(localStorage.getItem('aiCardStates') || '{}');

    Object.keys(states).forEach(cardId => {
        const card = document.getElementById(cardId);
        if (card && states[cardId]) {
            card.classList.add('collapsed');
        }
    });
}

// Export for use in other scripts
window.aiCardToggle = {
    initialize: initializeAICardToggles,
    toggle: toggleCard,
    saveState: saveCardState,
    loadStates: loadCardStates
};
