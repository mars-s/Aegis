import { useEffect, useRef, useState } from 'react';
import type { CardBodyProps } from '../../composition.js';
import { useCard } from '../../workspace/index.js';
import { useCreativeServices } from '../../features/media/services.js';
import { normaliseLink, spotifyHeight, spotifyOf } from '../../features/media/link-model.js';
import { MediaDialog } from '../../features/media/MediaDialog.js';
import { LinkProps } from './props.js';
export function LinkBody({ cardId, workspace, engine }: CardBodyProps) {
  const card = useCard(workspace, cardId), services = useCreativeServices();
  const [editing, setEditing] = useState(false), [address, setAddress] = useState(''), [title, setTitle] = useState(''), [description, setDescription] = useState('');
  const input = useRef<HTMLInputElement>(null), boardId = workspace.metadata.getSnapshot().id;
  const props = LinkProps.parse(card?.props ?? {}), url = card?.url ?? '', loading = !!url && props.previewFor !== url;
  useEffect(() => {
    if (!loading) return;
    const lifetime = new AbortController();
    void services.linkPreview(url, lifetime.signal).then(preview => {
      const current = workspace.record(cardId).getSnapshot();
      if (lifetime.signal.aborted || workspace.metadata.getSnapshot().id !== boardId || current?.url !== url) return;
      const spotify = spotifyOf(url), h = spotify ? spotifyHeight(spotify.kind) : preview.image ? 270 : 130;
      workspace.submit([{ op: 'update', id: cardId, set: { ...(current.h <= 76 || current.h === 130 || spotify && current.h < h ? { h } : {}), props: { preview: { ...preview }, previewFor: url, previewError: null } } }]);
    }).catch(error => {
      if (!lifetime.signal.aborted && workspace.metadata.getSnapshot().id === boardId && workspace.card(cardId).getSnapshot()?.url === url) workspace.submit([{ op: 'update', id: cardId, set: { props: { previewFor: url, previewError: error instanceof Error ? error.message : String(error) } } }]);
    });
    return () => lifetime.abort();
  }, [loading, url, boardId, cardId, services, workspace]);
  useEffect(() => () => engine.pin(cardId, 'dirty', false), [engine, cardId]);
  if (!card) return null;
  function edit() { setAddress(url); setTitle(props.title || card?.text || props.preview.title); setDescription(props.description ?? props.preview.description); engine.pin(cardId, 'dirty', true); setEditing(true); }
  const close = () => { setEditing(false); engine.pin(cardId, 'dirty', false); };
  function saveLink(element: HTMLInputElement) {
    try {
      const value = normaliseLink(address.trim()), spotify = spotifyOf(value), changed = value !== url;
      if (workspace.metadata.getSnapshot().id === boardId) workspace.submit([{ op: 'update', id: cardId, set: { url: value, ...(changed && spotify ? { h: spotifyHeight(spotify.kind), w: 340 } : {}), props: { title: changed && title === (props.title || card?.text || props.preview.title) ? '' : title, description: changed && description === (props.description ?? props.preview.description) ? '' : description, ...(changed ? { preview: null, previewFor: null, previewError: null } : {}) } } }]);
      close();
    } catch (error) { element.setCustomValidity(error instanceof Error ? error.message : String(error)); element.reportValidity(); }
  }
  if (!url) return <input ref={input} className="url-input" placeholder="Paste a link" aria-label="Link address" onKeyDown={event => {
    event.stopPropagation(); const value = event.currentTarget.value.trim();
    if (event.key === 'Escape') { event.currentTarget.blur(); if (!value && !card.text && !props.title) workspace.submit([{ op: 'delete', ids: [cardId] }]); return; }
    if (event.key !== 'Enter' || !value) return;
    try { const next = normaliseLink(value), spotify = spotifyOf(next); workspace.submit([{ op: 'update', id: cardId, set: { url: next, h: spotify ? spotifyHeight(spotify.kind) : 130, ...(spotify ? { w: 340 } : {}) } }]); } catch (error) { services.notify(error instanceof Error ? error.message : String(error)); }
  }} />;
  const spotify = spotifyOf(url);
  return <div className={`creative-link${loading ? ' link-loading' : ''}${spotify ? ' spotify-embed' : ''}`} aria-busy={loading}>
    {loading && <div className="link-loading-status" role="status">Loading preview…</div>}
    <div className="media-head">{props.preview.favicon && !spotify && <img className="link-favicon" src={props.preview.favicon} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}<strong>{props.title || card.text || props.preview.title || (spotify ? 'Spotify' : new URL(url).hostname)}</strong></div>
    {spotify ? <iframe src={`https://open.spotify.com/embed/${spotify.kind}/${spotify.sid}`} title="Spotify player" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" style={{ minHeight: ['track', 'episode'].includes(spotify.kind) ? 152 : 352 }} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /> : <>{props.preview.image && <img className="link-image" src={props.preview.image} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}{(props.description ?? props.preview.description) && <p className="link-description">{props.description ?? props.preview.description}</p>}<a className="link-address" href={url} onClick={event => { event.preventDefault(); void services.openUrl(url); }}>{url}</a></>}
    <div className="media-actions"><button onClick={() => void services.openUrl(url)}>Open link</button><button onClick={edit}>Edit link</button>{props.previewError && <button title={props.previewError} onClick={() => workspace.submit([{ op: 'update', id: cardId, set: { props: { previewFor: null, previewError: null } } }])}>Retry preview</button>}</div>
    {editing && <MediaDialog label="Edit link" onClose={close}><label className="media-field">Link address<input ref={input} aria-label="Link address" type="url" value={address} onChange={event => { event.currentTarget.setCustomValidity(''); setAddress(event.currentTarget.value); }} /></label><label className="media-field">Title<input aria-label="Title" value={title} onChange={event => setTitle(event.currentTarget.value)} /></label><label className="media-field">Description<input aria-label="Description" value={description} onChange={event => setDescription(event.currentTarget.value)} /></label><button onClick={() => { if (input.current) saveLink(input.current); }}>Save link</button><button onClick={close}>Cancel</button></MediaDialog>}
  </div>;
}
