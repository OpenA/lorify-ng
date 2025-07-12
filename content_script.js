
const { runtime, storage } = typeof browser !== 'undefined' ? browser : chrome;

let port = null;

const portConnect = () => new Promise(resolve => {
	const p = runtime.connect({ name: 'lory-wss' });
	p.onMessage.addListener(({ action, data }) => {
		if (action === 'connection-resolve') {
			console.info('WebExt Runtime Connected!');
			port = p; resolve(data);
		} else
			window.postMessage({ wsEvent: action, wsData: data });
	});
	p.onDisconnect.addListener(() => {
		console.info('WebExt Runtime Disconnected!');
		port = null;
	});
});

window.postMessage({ wsEvent: 'web-ext-ready', wsData: 0 });
window.addEventListener('message', ({ origin, data }) => {
	if (location.origin === origin && 'l0rNG_Act' in data) {
		let req = { action: data.l0rNG_Act, data: data.l0rNG_Dat };
		if (port)
			port.postMessage(req);
		else
			portConnect().then(() => port.postMessage(req));
	}
});

Promise.all([portConnect(), storage.local.get()]).then(([defs, vals]) => {
	window.postMessage({
		wsEvent: 'settings-change', wsData: Object.assign(defs, vals) });
});
