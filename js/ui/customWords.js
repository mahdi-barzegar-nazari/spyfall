/**
 * Custom word bank UI: add, delete, JSON export/import.
 */

import { cleanCustomWord, getCustomWords, saveCustomWords } from '../core/storage.js';
import { showToast } from './feedback.js';
import { escapeHtml, normalizeWord } from '../utils/text.js';

export function addCustomWordDOM() {
    let w = document.getElementById('cust-word').value.trim();
    let f = document.getElementById('cust-fool').value.trim() || w;
    let h = document.getElementById('cust-hint').value.trim() || "بدون راهنما";
    
    if (!w) { showToast("کلمه اصلی را وارد فرمایید!"); return; }
    if (w.length > 30 || f.length > 30) { showToast("طول کلمه نباید بیشتر از ۳۰ کاراکتر باشد!"); return; }
    if (h.length > 30) { showToast("طول راهنما نباید بیشتر از ۳۰ کاراکتر باشد!"); return; }

    let list = getCustomWords();
    if (list.length >= 1000) {
        showToast("حداکثر سقف مجاز ثبت کلمات سفارشی تکمیل شده است.");
        return;
    }
    list.push({ word: w, foolWord: f, hint: h, diff: "medium" });
    saveCustomWords(list);
    document.getElementById('cust-word').value = '';
    document.getElementById('cust-fool').value = '';
    document.getElementById('cust-hint').value = '';
    renderCustomWordsList();
    showToast("کلمه با موفقیت اضافه شد!");
}

function deleteCustomWord(idx) {
    let list = getCustomWords();
    list.splice(idx, 1);
    saveCustomWords(list);
    renderCustomWordsList();
}

export function renderCustomWordsList() {
    let list = getCustomWords();
    document.getElementById('cust-count').textContent = list.length;
    let c = document.getElementById('custom-words-list');
    c.innerHTML = '';
    list.forEach((item, idx) => {
        let div = document.createElement('div');
        div.className = 'toggle-item p-6-10';
        
        let infoDiv = document.createElement('div');
        infoDiv.className = 'flex-1';
        infoDiv.innerHTML = `<strong>${escapeHtml(item.word)}</strong> <span class="color-secondary" style="font-size:0.75rem;">(${escapeHtml(item.hint||'')})</span>`;
        
        let delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-ghost btn-sm color-rose w-auto m-0';
        delBtn.style.padding = '2px 8px';
        delBtn.textContent = '🗑️';
        delBtn.setAttribute('aria-label', `حذف کلمه ${item.word}`);
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
        showToast("فایل بیش از حد بزرگ است!");
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
                        showToast(`${deduplicatedNew.length} کلمه جدید افزوده شد!`);
                    } else {
                        showToast("تمام کلمات فایل قبلاً ثبت شده بودند.");
                    }
                }
            }
        } catch(err) { showToast("خطا در پردازش فایل JSON!"); }
        inputFile.value = '';
    };
    reader.readAsText(file);
}
