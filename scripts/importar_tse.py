"""Importa os cadastros públicos SP/BR do TSE, sem CPF ou outros dados pessoais."""
import csv
import io
import json
import pathlib
import urllib.request
import zipfile
import argparse
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = 'https://cdn.tse.jus.br/estatistica/sead/odsele'
SOURCE = 'https://dadosabertos.tse.jus.br/dataset/candidatos-2026'

def read_archive(kind):
    path = ROOT / 'tmp' / f'{kind}_2026.zip'
    path.parent.mkdir(exist_ok=True)
    urllib.request.urlretrieve(f'{BASE}/{kind}/{kind}_2026.zip', path)
    rows = []
    with zipfile.ZipFile(path) as archive:
        for uf in ('SP', 'BR'):
            with archive.open(f'{kind}_2026_{uf}.csv') as stream:
                rows.extend(csv.DictReader(io.TextIOWrapper(stream, encoding='latin1'), delimiter=';'))
    return rows

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fotos', action='store_true', help='Baixa e inclui as fotos oficiais')
    args = parser.parse_args()
    rows = read_archive('consulta_cand')
    details = {r['SQ_CANDIDATO']: r for r in read_archive('consulta_cand_complementar')}
    active = [r for r in rows if r['ANO_ELEICAO'] == '2026' and r['NR_TURNO'] == '1'
              and details[r['SQ_CANDIDATO']]['ST_CANDIDATO_INSERIDO_URNA'] == 'SIM'
              and details[r['SQ_CANDIDATO']]['ST_SUBSTITUIDO'] != 'S']
    groups = {'DEPUTADO FEDERAL':'deputado_federal', 'DEPUTADO ESTADUAL':'deputado_estadual',
              'SENADOR':'senador', 'GOVERNADOR':'governador', 'PRESIDENTE':'presidente'}
    candidates = {key: [] for key in groups.values()}
    parties = {}
    for row in active:
        if row['DS_CARGO'] not in groups:
            continue
        group = groups[row['DS_CARGO']]
        item = {'numero':row['NR_CANDIDATO'], 'nome':row['NM_URNA_CANDIDATO'],
                'partido':row['SG_PARTIDO'], 'foto':None, 'idTse':row['SQ_CANDIDATO'],
                'situacao':details[row['SQ_CANDIDATO']]['DS_SITUACAO_JULGAMENTO']}
        related = [r for r in active if r['SG_UF'] == row['SG_UF']
                   and r['NR_CANDIDATO'] == row['NR_CANDIDATO']
                   and r['SQ_COLIGACAO'] == row['SQ_COLIGACAO']]
        vice_role = {'governador':'VICE-GOVERNADOR', 'presidente':'VICE-PRESIDENTE'}.get(group)
        if vice_role:
            vice = [r for r in related if r['DS_CARGO'] == vice_role]
            if len(vice) != 1:
                raise ValueError(f'Confira a chapa {group} {item["numero"]}: vice ausente ou ambíguo')
            item['vice'] = vice[0]['NM_URNA_CANDIDATO']
        if group == 'senador':
            item['suplentes'] = [r['NM_URNA_CANDIDATO'] for r in sorted(related, key=lambda r:r['DS_CARGO']) if 'SUPLENTE' in r['DS_CARGO']]
        if any(c['numero'] == item['numero'] for c in candidates[group]):
            raise ValueError(f'Número ativo duplicado: {group} {item["numero"]}')
        candidates[group].append(item)
        parties[row['NR_PARTIDO']] = {'numero':row['NR_PARTIDO'], 'sigla':row['SG_PARTIDO'], 'nome':row['NM_PARTIDO']}
    if any(not values for values in candidates.values()):
        raise ValueError('Cadastro incompleto; o arquivo anterior foi preservado.')
    for values in candidates.values():
        values.sort(key=lambda c:int(c['numero']))
    if args.fotos:
        target = ROOT / 'assets' / 'candidatos'
        target.mkdir(parents=True, exist_ok=True)
        for uf in ('SP', 'BR'):
            archive_path = ROOT / 'tmp' / f'fotos_{uf}.zip'
            urllib.request.urlretrieve(f'https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_{uf}_div.zip', archive_path)
            with zipfile.ZipFile(archive_path) as archive:
                available = set(archive.namelist())
                for group, values in candidates.items():
                    if (group == 'presidente') != (uf == 'BR'):
                        continue
                    for item in values:
                        name = f'F{uf}{item["idTse"]}_div.jpg'
                        if name in available:
                            (target / name).write_bytes(archive.read(name))
                            item['foto'] = f'assets/candidatos/{name}'
    config = {'id':'sp-2026-turno1-v1','ano':2026,'uf':'SP','escola':'Urna Escola','demonstracao':False,
              'fonte':SOURCE, 'importadoEm':datetime.now(timezone.utc).isoformat(),
              'geracaoTse':rows[0]['DT_GERACAO'],
              'criterio':'Primeiro turno, SP e BR, inserido na urna = SIM e não substituído. Inclui registros sub judice; contagem exclusivamente educativa.',
              'partidos':sorted(parties.values(),key=lambda p:p['numero']), 'candidatos':candidates}
    path = ROOT / 'data' / 'candidatos.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    temporary.replace(path)
    print(json.dumps({group:len(values) for group,values in candidates.items()},ensure_ascii=True))

if __name__ == '__main__':
    main()
