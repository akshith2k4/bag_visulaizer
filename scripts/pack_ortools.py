#!/usr/bin/env python3
"""
pack_ortools.py
Accurate 3D Bin Packing for Red Bags using Google OR-Tools CP-SAT.

Formulation:
- Models realistic laundry stacks using 2D floor footprint placement (AddNoOverlap2D)
  combined with 1D vertical column height knapsack constraints.
- Guarantees 100% physical stability: every item rests on the floor or directly on the item below it.
- Enforces Red Bag boundaries (83 x 42 x 47 cm) and weight limits (25 kg).
- Minimizes the number of bags required with zero unphysical floating gaps.

Usage:
    python3 scripts/pack_ortools.py
    python3 scripts/pack_ortools.py --product double-duvet-cover --count 20
    python3 scripts/pack_ortools.py --order '{"double-duvet-cover": 6, "double-bed-sheet": 6, "hand-towel": 12, "pillow-cover": 20}'
"""

import sys
import json
import time
import argparse
from ortools.sat.python import cp_model

RED_BAG = {
    "name": "Red Bag",
    "length": 83.0,  # X axis (cm)
    "width": 42.0,   # Z axis (cm)
    "height": 47.0,  # Y axis (cm)
    "max_weight": 25.0 # kg
}

PRODUCTS_CATALOG = {
    "pillow-cover":      {"name": "Pillow Cover", "l": 36.9, "w": 24.5, "h": 0.3133, "weight": 0.12, "color": "#f8fafc"},
    "hand-towel":        {"name": "Hand Towel", "l": 37.6, "w": 29.2, "h": 0.9400, "weight": 0.20, "color": "#38bdf8"},
    "double-bed-sheet":  {"name": "Double Bed Sheet", "l": 67.5, "w": 38.5, "h": 1.0444, "weight": 0.85, "color": "#c084fc"},
    "single-bed-sheet":  {"name": "Single Bed Sheet", "l": 47.5, "w": 39.0, "h": 1.0444, "weight": 0.60, "color": "#a5b4fc"},
    "bath-mat":          {"name": "Bath Mat (3 Fold)", "l": 35.5, "w": 24.0, "h": 1.2368, "weight": 0.40, "color": "#4ade80"},
    "bath-robe":         {"name": "Bath Robe", "l": 42.5, "w": 29.8, "h": 1.5667, "weight": 0.95, "color": "#fde047"},
    "single-duvet-cover":{"name": "Single Duvet Cover", "l": 43.5, "w": 30.0, "h": 2.3500, "weight": 0.90, "color": "#fb923c"},
    "double-duvet-cover":{"name": "Double Duvet Cover", "l": 73.7, "w": 34.5, "h": 2.3500, "weight": 1.40, "color": "#f43f5e"},
    "queen-duvet-cover": {"name": "Queen Duvet Cover", "l": 62.8, "w": 35.4, "h": 2.3500, "weight": 1.10, "color": "#f472b6"},
    "bath-towel":        {"name": "Bath Towel", "l": 36.8, "w": 26.5, "h": 3.1333, "weight": 0.50, "color": "#2dd4bf"},
    "face-towel":        {"name": "Face Towel", "l": 29.8, "w": 27.4, "h": 3.6154, "weight": 0.15, "color": "#34d399"},
}


class OrToolsLaundryPacker:
    """
    High-accuracy 3D laundry packing solver using Google OR-Tools CP-SAT.
    """
    def __init__(self, bag_spec=RED_BAG):
        self.bag_spec = bag_spec
        self.scale = 10 # Scale to mm for exact integer arithmetic
        self.bag_l = int(round(bag_spec["length"] * self.scale))
        self.bag_w = int(round(bag_spec["width"] * self.scale))
        self.bag_h = int(round(bag_spec["height"] * self.scale))
        self.max_weight = bag_spec.get("max_weight", 25.0)

    def pack(self, items_input, time_limit_sec=5.0, max_bags=8):
        start_time = time.time()

        # Parse and aggregate items
        catalog_items = []
        for entry in items_input:
            if isinstance(entry, (tuple, list)):
                pid, count = entry[0], entry[1]
            elif isinstance(entry, dict):
                pid = entry.get("id") or entry.get("product_id")
                count = entry.get("count", 1)
            else:
                continue

            spec = PRODUCTS_CATALOG.get(pid)
            if not spec or count <= 0:
                continue

            catalog_items.append({
                "id": pid,
                "name": spec["name"],
                "l": spec["l"],
                "w": spec["w"],
                "h": spec["h"],
                "weight": spec.get("weight", 0.5),
                "color": spec.get("color", "#cbd5e1"),
                "count": count
            })

        if not catalog_items:
            return {"bagsRequired": 0, "bags": [], "unfittedItems": [], "status": "EMPTY"}

        # Attempt to pack with minimum bags: 1, 2, ..., max_bags
        for num_bags in range(1, max_bags + 1):
            res = self._solve_packing(catalog_items, num_bags, time_limit_sec)
            if res is not None:
                res["solve_time_sec"] = round(time.time() - start_time, 3)
                res["solver"] = "Google OR-Tools CP-SAT"
                return res

        return {
            "bagsRequired": max_bags,
            "bags": [],
            "status": "EXCEEDED_MAX_BAGS",
            "solve_time_sec": round(time.time() - start_time, 3)
        }

    def _solve_packing(self, catalog_items, num_bags, time_limit_sec):
        """
        Solves multi-bag 3D packing using column stacks and 2D floor non-overlap.
        """
        model = cp_model.CpModel()

        # Precompute possible column stacks for each product:
        # A column stack is a homogeneous stack of items of product p with a fixed floor orientation (0° or 90°).
        # We find max items per column that fit the bag height (47 cm).
        stack_types = []
        for p_idx, p in enumerate(catalog_items):
            max_in_stack = max(1, int(self.bag_spec["height"] // p["h"]))
            # Test orientation 0°: Length along X, Width along Z
            if p["l"] <= self.bag_spec["length"] and p["w"] <= self.bag_spec["width"]:
                stack_types.append({
                    "product_idx": p_idx,
                    "product": p,
                    "rot": 0,
                    "dx": int(round(p["l"] * self.scale)),
                    "dz": int(round(p["w"] * self.scale)),
                    "max_count": max_in_stack
                })
            # Test orientation 90°: Width along X, Length along Z
            if p["w"] <= self.bag_spec["length"] and p["l"] <= self.bag_spec["width"]:
                stack_types.append({
                    "product_idx": p_idx,
                    "product": p,
                    "rot": 90,
                    "dx": int(round(p["w"] * self.scale)),
                    "dz": int(round(p["l"] * self.scale)),
                    "max_count": max_in_stack
                })

        if not stack_types:
            return None

        # Build column decision variables across the bags
        # Upper bound on total columns per product = ceil(total_count / 1)
        columns = []
        col_id = 0
        for st in stack_types:
            p = st["product"]
            # Number of candidate columns needed for this product type
            num_candidates = min(8, max(1, (p["count"] + st["max_count"] - 1) // st["max_count"] + 1))
            for c in range(num_candidates):
                active = model.NewBoolVar(f"col_active_{col_id}")
                bag = model.NewIntVar(0, num_bags - 1, f"col_bag_{col_id}")
                count_in_col = model.NewIntVar(0, min(p["count"], st["max_count"]), f"col_count_{col_id}")

                # If inactive, count must be 0
                model.Add(count_in_col == 0).OnlyEnforceIf(active.Not())
                model.Add(count_in_col >= 1).OnlyEnforceIf(active)

                # Floor coordinates of this column
                x = model.NewIntVar(0, self.bag_l - st["dx"], f"col_x_{col_id}")
                z = model.NewIntVar(0, self.bag_w - st["dz"], f"col_z_{col_id}")

                # Optional interval for 2D floor non-overlap
                x_interval = model.NewOptionalIntervalVar(x, st["dx"], x + st["dx"], active, f"x_int_{col_id}")
                z_interval = model.NewOptionalIntervalVar(z, st["dz"], z + st["dz"], active, f"z_int_{col_id}")

                columns.append({
                    "id": col_id,
                    "stack_type": st,
                    "active": active,
                    "bag": bag,
                    "count": count_in_col,
                    "x": x,
                    "z": z,
                    "dx": st["dx"],
                    "dz": st["dz"],
                    "x_interval": x_interval,
                    "z_interval": z_interval,
                    "product_idx": st["product_idx"],
                    "rot": st["rot"]
                })
                col_id += 1

        # 1. Total count of each product packed must equal requested count
        for p_idx, p in enumerate(catalog_items):
            matching_cols = [c["count"] for c in columns if c["product_idx"] == p_idx]
            model.Add(sum(matching_cols) == p["count"])

        # 2. Floor non-overlap inside each bag:
        # For columns in the same bag, their 2D floor footprints (X, Z) cannot overlap!
        for b in range(num_bags):
            b_intervals_x = []
            b_intervals_z = []
            for col in columns:
                in_this_bag = model.NewBoolVar(f"col_{col['id']}_in_b{b}")
                model.Add(col["bag"] == b).OnlyEnforceIf(in_this_bag)
                model.Add(col["bag"] != b).OnlyEnforceIf(in_this_bag.Not())

                # Both active and in this bag
                col_in_bag = model.NewBoolVar(f"active_{col['id']}_in_b{b}")
                model.AddBoolAnd([col["active"], in_this_bag]).OnlyEnforceIf(col_in_bag)
                model.AddBoolOr([col["active"].Not(), in_this_bag.Not()]).OnlyEnforceIf(col_in_bag.Not())

                opt_x = model.NewOptionalIntervalVar(col["x"], col["dx"], col["x"] + col["dx"], col_in_bag, f"bx_{col['id']}_{b}")
                opt_z = model.NewOptionalIntervalVar(col["z"], col["dz"], col["z"] + col["dz"], col_in_bag, f"bz_{col['id']}_{b}")
                b_intervals_x.append(opt_x)
                b_intervals_z.append(opt_z)

            model.AddNoOverlap2D(b_intervals_x, b_intervals_z)

            # Weight limit constraint per bag
            col_weights = []
            for col in columns:
                # weight = count * unit_weight
                unit_wt_int = int(round(col["stack_type"]["product"]["weight"] * 100))
                wt_var = model.NewIntVar(0, int(self.max_weight * 100), f"wt_{col['id']}_b{b}")
                # Enforce wt_var = count * unit_wt_int if in_bag else 0
                in_b = model.NewBoolVar(f"wt_in_b_{col['id']}_{b}")
                model.Add(col["bag"] == b).OnlyEnforceIf(in_b)
                model.Add(col["bag"] != b).OnlyEnforceIf(in_b.Not())
                model.Add(wt_var == col["count"] * unit_wt_int).OnlyEnforceIf(in_b)
                model.Add(wt_var == 0).OnlyEnforceIf(in_b.Not())
                col_weights.append(wt_var)

            model.Add(sum(col_weights) <= int(self.max_weight * 100))

        # Objective: minimize active columns and stack heights
        total_active_cols = sum(col["active"] for col in columns)
        model.Minimize(total_active_cols)

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = time_limit_sec
        solver.parameters.num_workers = 1

        status = solver.Solve(model)

        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            bags_result = [[] for _ in range(num_bags)]

            for col in columns:
                if solver.Value(col["active"]):
                    b_idx = solver.Value(col["bag"])
                    count = solver.Value(col["count"])
                    if count <= 0:
                        continue
                    cx = solver.Value(col["x"]) / self.scale
                    cz = solver.Value(col["z"]) / self.scale
                    st = col["stack_type"]
                    p = st["product"]
                    item_dx = st["dx"] / self.scale
                    item_dz = st["dz"] / self.scale
                    item_h = p["h"]

                    # Generate individual 3D item coordinates in this vertical column
                    for layer in range(count):
                        cy = layer * item_h
                        bags_result[b_idx].append({
                            "id": p["id"],
                            "name": p["name"],
                            "x": round(cx, 2),
                            "y": round(cy, 2),
                            "z": round(cz, 2),
                            "dx": round(item_dx, 2),
                            "dy": round(item_h, 2),
                            "dz": round(item_dz, 2),
                            "rotation": st["rot"],
                            "layer": layer + 1,
                            "weight": p["weight"],
                            "color": p["color"]
                        })

            formatted_bags = []
            for idx, items_in_bag in enumerate(bags_result):
                if not items_in_bag:
                    continue
                bag_vol = self.bag_spec["length"] * self.bag_spec["width"] * self.bag_spec["height"]
                packed_vol = sum(it["dx"] * it["dy"] * it["dz"] for it in items_in_bag)
                max_h = max(it["y"] + it["dy"] for it in items_in_bag)
                tot_wt = sum(it["weight"] for it in items_in_bag)

                formatted_bags.append({
                    "bagIndex": idx,
                    "bagName": f"Red Bag #{idx + 1}",
                    "itemCount": len(items_in_bag),
                    "items": items_in_bag,
                    "maxHeight": round(max_h, 2),
                    "totalWeight": round(tot_wt, 2),
                    "volumeUtilization": round((packed_vol / bag_vol) * 100, 1),
                    "heightFits": max_h <= self.bag_spec["height"] + 0.05
                })

            return {
                "bagsRequired": len(formatted_bags),
                "bags": formatted_bags,
                "unfittedItems": [],
                "status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
            }

        return None


def main():
    parser = argparse.ArgumentParser(description="Google OR-Tools CP-SAT 3D Linen Logistics Packer")
    parser.add_argument("--product", "-p", help="Single product ID to test (e.g. double-duvet-cover)")
    parser.add_argument("--count", "-c", type=int, default=20, help="Quantity for single product")
    parser.add_argument("--order", "-o", help="JSON string of product quantities")
    parser.add_argument("--time-limit", "-t", type=float, default=5.0, help="Solver time limit (sec)")

    parser.add_argument("--json", action="store_true", help="Output results in JSON format")

    args = parser.parse_args()

    packer = OrToolsLaundryPacker()

    if args.order:
        try:
            order_dict = json.loads(args.order)
            items = list(order_dict.items())
        except json.JSONDecodeError:
            print("Error: Invalid JSON order format", file=sys.stderr)
            sys.exit(1)
    elif args.product:
        items = [(args.product, args.count)]
    else:
        # Default test benchmark: mixed laundry basket
        items = [
            ("double-duvet-cover", 6),
            ("double-bed-sheet", 6),
            ("hand-towel", 12),
            ("pillow-cover", 20)
        ]

    total_units = sum(cnt for _, cnt in items)
    if not args.json:
        print(f"[*] Bag Dimensions: {RED_BAG['length']} x {RED_BAG['width']} x {RED_BAG['height']} cm (Max: {RED_BAG['max_weight']} kg)")
        print(f"[*] Items to Pack: {total_units} units across {len(items)} types")
        for pid, count in items:
            pname = PRODUCTS_CATALOG.get(pid, {}).get("name", pid)
            print(f"    - {pname}: {count} units")

    res = packer.pack(items, time_limit_sec=args.time_limit)

    if args.json:
        print(json.dumps(res, indent=2))
        return

    print("\n" + "=" * 60)
    print(f"[✓] Solver Result: {res.get('status')} in {res.get('solve_time_sec', 0)}s")
    print(f"[✓] Bags Required: {res.get('bagsRequired')}")
    print("=" * 60)

    for bag in res.get("bags", []):
        print(f"\n🎒 {bag['bagName']}:")
        print(f"   Items: {bag['itemCount']} units | Weight: {bag['totalWeight']} kg / {RED_BAG['max_weight']} kg")
        print(f"   Max Height: {bag['maxHeight']} cm / {RED_BAG['height']} cm (Fits: {bag['heightFits']})")
        print(f"   Volume Utilization: {bag['volumeUtilization']}%")
        print("   Sample coordinates (first 5 items):")
        for it in bag["items"][:5]:
            print(f"     • {it['name']} L{it['layer']}: pos=({it['x']}, {it['y']}, {it['z']}) dim=({it['dx']}x{it['dy']}x{it['dz']}) rot={it['rotation']}°")


if __name__ == "__main__":
    main()
