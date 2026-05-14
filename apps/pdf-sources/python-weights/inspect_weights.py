#!/usr/bin/env python3
"""
Lista metadados e tensores de ficheiros .gguf ou .safetensors (NumPy).
Não usa PyTorch. Não executa inferência do modelo.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _inspect_gguf(path: Path) -> None:
    try:
        from gguf import GGUFReader
    except ImportError as e:
        print("Instale as dependências: pip install -r requirements.txt", file=sys.stderr)
        raise SystemExit(1) from e

    reader = GGUFReader(str(path))
    print("GGUF:", path)
    print("\n[metadata]")
    keys = sorted(reader.fields.keys())
    max_k = max(len(k) for k in keys) if keys else 0
    for key in keys:
        field = reader.fields[key]
        value = field.parts[field.data[0]]
        print(f"  {key:{max_k}}  {value}")

    print("\n[tensors]")
    for tensor in reader.tensors:
        shape_s = "x".join(map(str, tensor.shape))
        print(
            f"  {tensor.name:48}  shape={shape_s:20}  n_elements={tensor.n_elements}  "
            f"type={tensor.tensor_type.name}"
        )


def _inspect_safetensors(path: Path, list_tensors: bool) -> None:
    try:
        from safetensors import safe_open
    except ImportError as e:
        print("Instale as dependências: pip install -r requirements.txt", file=sys.stderr)
        raise SystemExit(1) from e

    print("Safetensors:", path)
    with safe_open(str(path), framework="np", device="cpu") as f:
        keys = list(f.keys())
        print(f"\n{len(keys)} tensor(es)")
        if not list_tensors:
            print("(use --tensors para listar nome, shape e dtype de cada um)")
            return
        for key in keys:
            t = f.get_tensor(key)
            print(f"  {key:48}  shape={str(tuple(t.shape)):24}  dtype={t.dtype}")


def _inspect_safetensors_index(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    print("Safetensors index JSON:", path)
    weight_map = data.get("weight_map") or {}
    print(f"\nweight_map entries: {len(weight_map)}")
    shards = sorted(set(weight_map.values()))
    print("shards:", ", ".join(shards[:20]) + (" ..." if len(shards) > 20 else ""))


def main() -> None:
    p = argparse.ArgumentParser(description="Inspeciona GGUF ou Safetensors (sem PyTorch).")
    p.add_argument("path", type=Path, help="Ficheiro .gguf, .safetensors ou .safetensors.index.json")
    p.add_argument(
        "--tensors",
        action="store_true",
        help="Para .safetensors, carrega cada tensor em NumPy e imprime shape/dtype (pode ser pesado).",
    )
    args = p.parse_args()
    path = args.path.expanduser().resolve()
    if not path.is_file():
        print(f"Ficheiro inexistente: {path}", file=sys.stderr)
        raise SystemExit(2)

    suf = path.suffix.lower()
    name = path.name.lower()
    if suf == ".gguf" or name.endswith(".gguf"):
        _inspect_gguf(path)
    elif name.endswith("safetensors.index.json"):
        _inspect_safetensors_index(path)
    elif suf == ".safetensors" or name.endswith(".safetensors"):
        _inspect_safetensors(path, list_tensors=args.tensors)
    else:
        print(
            "Extensão não reconhecida. Use .gguf, .safetensors ou *.safetensors.index.json",
            file=sys.stderr,
        )
        raise SystemExit(2)


if __name__ == "__main__":
    main()
