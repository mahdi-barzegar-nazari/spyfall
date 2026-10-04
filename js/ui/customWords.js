/**
 * Custom word bank UI: add, delete, JSON export/import.
 */

import { cleanCustomWord, getCustomWords, saveCustomWords } from '../core/storage.js';
import { showToast } from './feedback.js';
import { formatNumber, t, tn } from '../i18n/index.js';
import { escapeHtml, normalizeWord } from '../utils/text.js';

// The longest a word, fool word or hint may be.
const MAX_TEXT_LENGTH = 30;

export function addCustomWordDOM() {
    let w = document.getElementById('cust-word').value.trim();
    let f = document.getElementById('cust-fool').value.trim() || w;
    let h = document.getElementById('cust-hint').value.trim() || t('setup.hint.none');
    
    if (!w) { showToast(t('toast.wordRequired')); return; }
    if (w.length > MAX_TEXT_LENGTH || f.length > MAX_TEXT_LENGTH) { showToast(t('toast.wordTooLong', { max: formatNumber(MAX_TEXT_LENGTH) })); return; }
    if (h.length > MAX_TEXT_LENGTH) { showToast(t('toast.hintTooLong', { max: formatNumber(MAX_TEXT_LENGTH) })); return; }

    let list = getCustomWords();
    if (list.length >= 1000) {
        showToast(t('toast.wordLimitReached'));
        return;
    }
    list.push({ word: w, foolWord: f, hint: h, diff: "medium" });
    saveCustomWords(list);
    document.getElementById('cust-word').value = '';
    document.getElementById('cust-fool').value = '';
    document.getElementById('cust-hint').value = '';
    renderCustomWordsList();
    showToast(t('toast.wordAdded'));
}

function deleteCustomWord(idx) {
    let list = getCustomWords();
    list.splice(idx, 1);
    saveCustomWords(list);
    renderCustomWordsList();
}

export function renderCustomWordsList() {
    let list = getCustomWords();
    document.getElementById('cust-count-label').textContent = t('words.registered', { count: list.length });
    let c = document.getElementById('custom-words-list');
    c.innerHTML = '';
    list.forEach((item, idx) => {
        let div = document.createElement('div');
        div.className = 'toggle-item p-6-10';
        
        let infoDiv = document.createElement('div');
        infoDiv.className = 'flex-1';
        infoDiv.innerHTML = `<strong>${escapeHtml(item.word)}</strong> <span class="color-secondary u-fs-075">(${escapeHtml(item.hint||'')})</span>`;
        
        let delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-ghost btn-sm color-rose w-auto m-0';
        delBtn.style.padding = '2px 8px';
        delBtn.textContent = '🗑️';
        delBtn.setAttribute('aria-label', t('customWords.delete.aria', { word: item.word }));
        delBtn.addEventListener('click', () => deleteCustomWord(idx));
        
        div.appendChild(infoDiv);
        div.appendChild(delBtn);
        c.appendChild(div);
    });
}

export function exportCustomWordsJSON() {
    let list = getCustomWords();
    let blob = new Blob([JSON.stringify({ version: 1, words: list }, null, 2)], { type: 'application/json' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = `SpyWords_Backup.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function importCustomWordsJSON(inputFile) {
    let file = inputFile.files[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
        showToast(t('toast.fileTooLarge'));
        inputFile.value = '';
        return;
    }
    let reader = new FileReader();
    reader.onload = (e) => {
        try {
            let parsed = JSON.parse(e.target.result);
            if (parsed && Array.isArray(parsed.words)) {
                let validWords = parsed.words.map(cleanCustomWord).filter(Boolean);
                if (validWords.length > 0) {
                    let current = getCustomWords();
                    let existing = new Set(current.map(x => normalizeWord(x.word)));
                    let deduplicatedNew = [];
                    let inMemorySeen = new Set();

                    validWords.forEach(w => {
                        let nw = normalizeWord(w.word);
                        if (!existing.has(nw) && !inMemorySeen.has(nw)) {
                            inMemorySeen.add(nw);
                            deduplicatedNew.push(w);
                        }
                    });

                    if (deduplicatedNew.length > 0) {
                        saveCustomWords([...current, ...deduplicatedNew]);
                        renderCustomWordsList();
                        showToast(tn('toast.wordsImported', deduplicatedNew.length, { count: deduplicatedNew.length }));
                    } else {
                        showToast(t('toast.wordsAllKnown'));
                    }
                }
            }
        } catch(err) { showToast(t('toast.importFailed')); }
        inputFile.value = '';
    };
    reader.readAsText(file);
}
