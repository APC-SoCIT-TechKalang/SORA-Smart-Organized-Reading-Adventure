import test from 'node:test';
import assert from 'node:assert/strict';
import {standardCatalogTitle,updateCatalogIdentity} from '../lib/catalog-title.ts';
import {parseEditionTitle,emptyBookMetadata,toFormMetadata} from '../app/api/catalog/lookup/metadata.ts';

test('edition formatting is deterministic and idempotent across manga series',()=>{
  for(const series of ['Fairy Tail','Black Clover','Naruto','One Piece','Sakamoto Days','Kaiju No. 8']) {
    const title=standardCatalogTitle(`${series} Vol. 08`,series,'08','Manga');
    assert.equal(title,`${series}, Volume 8`);
    assert.equal(standardCatalogTitle(title,series,8,'Manga'),title);
    const metadata={...emptyBookMetadata('9781646516544'),title,series,volume:'8',bookType:'Manga'};
    assert.equal(toFormMetadata(metadata).title,title);
  }
});
test('special editions, missing volumes and unresolved English identities remain reviewable',()=>{
  for(const title of ['Manga Omnibus 1','Manga Deluxe Edition 1','Manga 3-in-1','Manga (Volumes 1-3)'])
    assert.equal(standardCatalogTitle(title,'Manga',1,'Manga'),title);
  assert.equal(standardCatalogTitle('Standalone','', '', 'Manga'),'Standalone');
  assert.equal(standardCatalogTitle('呪術廻戦 1','呪術廻戦',1,'Manga'),'呪術廻戦 1');
  assert.equal(parseEditionTitle('Kaiju No. 8').volume,'');
  assert.equal(parseEditionTitle('Manga 2024').volume,'');
  assert.equal(parseEditionTitle('Manga Chapter 8').volume,'');
  assert.equal(parseEditionTitle('ナルト 第08巻').volume,'8');
});
test('series and volume changes regenerate titles while retaining manual overrides',()=>{
  const form={title:'Naruto, Volume 1',series_name:'Naruto',volume_number:'1',book_type:'Manga'};
  assert.equal(updateCatalogIdentity(form,'volume_number','2').title,'Naruto, Volume 2');
  assert.equal(updateCatalogIdentity({...form,title:'My curated edition'},'volume_number','2').title,'My curated edition');
});
