
var   timer    = null;
const options  = new Object;
const loriform = document.forms['loriform'];
const applymsg = document.getElementById('applymsg');
const notify   = document.getElementById('notifications');
const defaults = { // default options
	'Realtime Loader': true,
	'CSS3 Animation' : true,
	'Delay Open Preview': 50,
	'Delay Close Preview': 800,
	'Desktop Notification': true,
	'Preloaded Pages Count': 1
}

chrome.storage.sync.get(defaults, setValues);
chrome.storage.onChanged.addListener(items => {
	for (let name in items) {
		loriform.elements[name][
			loriform.elements[name].type === 'checkbox'
			? 'checked'
			: 'value'] = (
				options[name] = items[name].newValue
			);
	}
});

chrome.runtime.getBackgroundPage( ({ text, openTab }) => {
	notify.hidden = !text;
	notify.firstElementChild.textContent = text;
	notify.firstElementChild.onclick = () => {
		notify.hidden = true;
		openTab();
	}
});

applymsg.addEventListener('animationend', () => applymsg.classList.remove('apply-anim'));
loriform.onchange = onValueChange;
loriform.addEventListener('input', evt => {
	clearTimeout(timer);
	timer = setTimeout(() => {
		loriform.onchange = () => { loriform.onchange = onValueChange };
		onValueChange(evt);
	}, 750);
});
loriform.elements['resetSettings'].addEventListener('click', () => {
	chrome.storage.sync.set(defaults, () => applymsg.classList.add('apply-anim'));
	setValues(defaults);
});

function onValueChange({ target }) {
	clearTimeout(timer);
	switch (target.type) {
		case 'checkbox':
			options[target.id] = target.checked;
			break;
		case 'number':
			const min = Number (target.min);
			options[target.id] = target.valueAsNumber >= min ? target.valueAsNumber : (target.value = min);
	}
	chrome.storage.sync.set(options, () => applymsg.classList.add('apply-anim'));
}

function setValues(items) {
	for (let name in items) {
		loriform.elements[name][
			loriform.elements[name].type === 'checkbox'
			? 'checked'
			: 'value'] = (
				options[name] = items[name]
			);
	}
}
