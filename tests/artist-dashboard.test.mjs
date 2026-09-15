import test from 'node:test';
import assert from 'node:assert/strict';
import { getArtistDashboardStatus, getArtistDashboardSummary, getInitialDashboardTrack, toArtistDashboardTracks } from '../lib/artist-dashboard.ts';

const track = (id, status='draft') => ({ id, slug:`track-${id}`, title:`Track ${id}`, status, duration_seconds:180, cover_art_url:null, audio_file_path:'private-master.wav', rights_holders:[{email:'private@example.test'}], approved_by:'admin-id' });

test('each persisted moderation status has an accurate label and journey stage', () => {
  assert.equal(getArtistDashboardStatus('draft').stage, 0);
  assert.equal(getArtistDashboardStatus('pending_review').stage, 1);
  assert.equal(getArtistDashboardStatus('approved').stage, 2);
  for (const status of ['rejected', 'archived']) {
    const state=getArtistDashboardStatus(status);
    assert.equal(state.stage, -1);
    assert.notEqual(state.action, 'Continue draft');
    assert.match(state.label, new RegExp(status,'i'));
  }
  assert.equal(getArtistDashboardStatus('unknown').label, 'Status unavailable');
  assert.equal(getArtistDashboardStatus('toString').stage, -1);
});

test('account totals include the entire catalog and keep exceptional statuses separate', () => {
  const tracks=['draft','approved','pending_review','rejected','archived','approved','draft'].map((status,id)=>track(id,status));
  assert.deepEqual(getArtistDashboardSummary(tracks), {total:7,drafts:2,inReview:1,live:2,rejected:1,archived:1});
  assert.equal(toArtistDashboardTracks(tracks).length,5);
});

test('client projection excludes private master paths, ownership contacts and moderator data', () => {
  const [result]=toArtistDashboardTracks([track(1)]);
  assert.deepEqual(Object.keys(result).sort(),['coverUrl','duration','id','slug','status','title']);
  assert.equal(JSON.stringify(result).includes('private'),false);
});

test('initial selection resumes a recent draft, handles empty catalogs and preserves server ordering', () => {
  const tracks=toArtistDashboardTracks([track(1,'approved'),track(2,'draft'),track(3,'rejected')]);
  assert.equal(getInitialDashboardTrack(tracks).id,2);
  assert.equal(getInitialDashboardTrack(tracks.slice(0,1)).id,1);
  assert.equal(getInitialDashboardTrack([]),null);
  assert.deepEqual(tracks.map(t=>t.id),[1,2,3]);
  assert.equal(getArtistDashboardSummary([]).total,0);
});
