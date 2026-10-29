<script>
/* FX polish (non-invasif): efek "pop" tiap kali nilai angka berubah.
   Memakai MutationObserver, jadi tidak menyentuh logika data utama. */
(function () {
  'use strict';
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var targets = document.querySelectorAll('#suhuVal, #kelembabanVal, #modeVal, #statRx, #statTx');
    Array.prototype.forEach.call(targets, function (node) {
      new MutationObserver(function () {
        node.classList.remove('fx-pop');
        void node.offsetWidth; // reflow kecil untuk restart animasi
        node.classList.add('fx-pop');
      }).observe(node, { childList: true, characterData: true, subtree: true });
    });
    document.addEventListener('animationend', function (e) {
      if (e.target && e.target.classList) e.target.classList.remove('fx-pop');
    });
  } catch (err) { /* browser lama tanpa MutationObserver: abaikan diam-diam */ }
})();
</script>
