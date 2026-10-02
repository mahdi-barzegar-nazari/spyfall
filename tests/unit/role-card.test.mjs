/**
 * Tests for the detective's part of the role card: what ui/render.js (renderRoleModalContent) shows when the card
 * is opened again after the inquiry was used, and before it is. It runs on the fake DOM of helpers/fakeEnv.mjs.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { gameState, hostSecretState } from '../../js/core/state.js';
import { installFakeEnv } from './helpers/fakeEnv.mjs';
import { makePlayer, useGameHarness } from './helpers/harness.mjs';

const env = installFakeEnv();
const { renderRoleModalContent } = await import('../../js/ui/render.js');

// The result box as index.html has it: two utility classes and no colour. Its parent supplies the colour.
const BOX_CLASSES = 'mt-6 u-bold';

useGameHarness(env, {
    setup: () => {
        for (const id of [
            'modal-player-name',
            'modal-role-badge',
            'modal-secret-title',
            'modal-secret-content',
            'modal-fellow-spies',
            'modal-fellow-spies-text',
            'modal-quest-box',
            'modal-quest-text',
            'btn-detective-inquiry',
            'detective-target-select'
        ]) {
            env.el(id);
        }
        env.el('modal-detective-action').className = 'quest-box hidden border-primary color-primary';
        env.el('detective-result-box').className = BOX_CLASSES;
        // The fake classList has no toggle(); render.js uses it on the close button.
        const close = env.el('btn-role-close');
        close.classList.toggle = (name, force) => close.classList[force ? 'add' : 'remove'](name);
    }
});
after(() => env.uninstall());

/** Open the detective's card (player Q) and return the result box. `stored` is detectiveInquiryResult. */
function openDetectiveCard({ used, stored = null }) {
    gameState.players = [
        makePlayer('Q', { name: 'Detective', role: 'detective' }),
        makePlayer('S1', { name: 'Sara', role: 'spy', team: 'spy' }),
        makePlayer('C1', { name: 'Cyrus' })
    ];
    gameState.phase = 'reveal';
    gameState.settings.detectiveUsed = used;
    hostSecretState.detectiveUsed = used;
    hostSecretState.detectiveInquiryResult = stored;
    hostSecretState.secretWord = 'Zebra';
    hostSecretState.roles = { Q: { role: 'detective' }, S1: { role: 'spy', hint: 'hint' }, C1: { role: 'citizen' } };
    renderRoleModalContent('Q');
    return env.el('detective-result-box');
}

describe('the detective card, opened again after the inquiry', () => {
    it('shows the stored answer as plain text, for a spy and for a citizen alike', () => {
        for (const stored of ['«Sara» جاسوس است.', '«Cyrus» شهروند است.']) {
            const box = openDetectiveCard({ used: true, stored });
            assert.equal(box.textContent, stored);
            assert.equal(box.innerHTML, '', 'written as text, never as markup');
            assert.equal(box.className, BOX_CLASSES, 'no colour class');
            assert.deepEqual(box.style, {});
        }
        assert.equal(env.el('modal-detective-action').classList.contains('hidden'), false);
        assert.equal(env.el('btn-detective-inquiry').disabled, true);
        assert.equal(env.el('detective-target-select').disabled, true);
    });

    it('does not decide anything from what the stored text says', () => {
        for (const stored of ['«A» جاسوس است.', '«A» شهروند است.', 'جاسوس', 'any other text', '12']) {
            const box = openDetectiveCard({ used: true, stored });
            assert.equal(box.textContent, stored, stored);
            assert.equal(box.innerHTML, '', stored);
            assert.equal(box.className, BOX_CLASSES, stored);
        }
    });

    it('shows an answer saved by an earlier version exactly as it was saved, without an error', () => {
        for (const stored of ['⚠️ «Sara» قطعاً جاسوس است!', '✅ «Cyrus» شهروند بی‌گناه است.']) {
            const box = openDetectiveCard({ used: true, stored });
            assert.equal(box.textContent, stored);
            assert.equal(box.innerHTML, '');
            assert.equal(box.className, BOX_CLASSES);
        }
    });

    it('shows a name that contains HTML as plain text', () => {
        const stored = '«<img src=x onerror=alert(1)>» جاسوس است.';
        const box = openDetectiveCard({ used: true, stored });
        assert.equal(box.textContent, stored);
        assert.equal(box.innerHTML, '');
    });
});

describe('the detective card, before the inquiry', () => {
    it('has an empty result, enabled controls and the other alive players as targets', () => {
        const box = openDetectiveCard({ used: false });
        assert.equal(box.textContent, '');
        assert.equal(box.innerHTML, '');
        assert.equal(env.el('btn-detective-inquiry').disabled, false);
        assert.equal(env.el('detective-target-select').disabled, false);
        assert.deepEqual(
            env.el('detective-target-select').children.map((o) => o.value),
            ['S1', 'C1']
        );
    });
});
