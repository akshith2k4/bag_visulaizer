#!/usr/bin/env python3
"""
pack_red_bag.py - 3D Bin Packing for Linen Logistics
Uses py3dbp with Yaw-only rotation rules and support constraints.

Usage:
  python3 scripts/pack_red_bag.py
  python3 scripts/pack_red_bag.py --order '{"pillow-cover": 40, "hand-towel": 20, "single-bed-sheet": 10}'
"""

import sys
import json
import argparse
from decimal import Decimal

try:
    from py3dbp import Packer, Bin, Item
    from py3dbp.constants import RotationType
    from py3dbp.auxiliary_methods import intersect
except ImportError:
    print("Error: py3dbp is required. Install via: pip install py3dbp")
    sys.exit(1)

RED_BAG = {
    "name": "Red Bag",
    "length": 83.0,  # X axis (cm)
    "width": 42.0,   # Z axis / breadth (cm)
    "height": 47.0,  # Y axis / height (cm)
    "max_weight": 25.0 # kg
}

LINEN_CATALOG = {
    "pillow-cover":      {"name": "Pillow Cover", "l": 36.9, "h": 0.3133, "w": 24.5, "weight": 0.12, "color": "#f8fafc"},
    "hand-towel":        {"name": "Hand Towel", "l": 37.6, "h": 0.9400, "w": 29.2, "weight": 0.20, "color": "#38bdf8"},
    "double-bed-sheet":  {"name": "Double Bed Sheet", "l": 67.5, "h": 1.0444, "w": 38.5, "weight": 0.85, "color": "#c084fc"},
    "single-bed-sheet":  {"name": "Single Bed Sheet", "l": 47.5, "h": 1.0444, "w": 39.0, "weight": 0.60, "color": "#a5b4fc"},
    "bath-mat":          {"name": "Bath Mat (3 Fold)", "l": 35.5, "h": 1.2368, "w": 24.0, "weight": 0.40, "color": "#4ade80"},
    "bath-robe":         {"name": "Bath Robe", "l": 42.5, "h": 1.5667, "w": 29.8, "weight": 0.95, "color": "#fde047"},
    "single-duvet-cover":{"name": "Single Duvet Cover", "l": 43.5, "h": 2.3500, "w": 30.0, "weight": 0.90, "color": "#fb923c"},
    "double-duvet-cover":{"name": "Double Duvet Cover", "l": 73.7, "h": 2.3500, "w": 34.5, "weight": 1.40, "color": "#f43f5e"},
    "queen-duvet-cover": {"name": "Queen Duvet Cover", "l": 62.8, "h": 2.3500, "w": 35.4, "weight": 1.10, "color": "#f472b6"},
    "bath-towel":        {"name": "Bath Towel", "l": 36.8, "h": 3.1333, "w": 26.5, "weight": 0.50, "color": "#2dd4bf"},
    "face-towel":        {"name": "Face Towel", "l": 29.8, "h": 3.6154, "w": 27.4, "weight": 0.15, "color": "#34d399"},
}

class LinenItem(Item):
    """Restricted to horizontal (Yaw-only) rotations so thickness remains vertical."""
    ALLOWED_ROTATIONS = [RotationType.RT_WHD, RotationType.RT_DHW]

    def __init__(self, item_id, name, length, height, width, weight, color):
        super().__init__(name, length, height, width, weight)
        self.item_id = item_id
        self.color = color

class LinenBin(Bin):
    """Red Bag with boundary and support constraint checking."""
    def put_item(self, item, pivot):
        valid_item_position = item.position
        item.position = pivot

        for rot in getattr(item, 'ALLOWED_ROTATIONS', RotationType.ALL):
            item.rotation_type = rot
            dim = item.get_dimension()
            
            # 1. Boundary check
            if (
                self.width < pivot[0] + dim[0] or
                self.height < pivot[1] + dim[1] or
                self.depth < pivot[2] + dim[2]
            ):
                continue

            # 2. Collision check
            collides = False
            for current in self.items:
                if intersect(current, item):
                    collides = True
                    break
            if collides:
                continue

            # 3. Support check for elevated items
            if pivot[1] > 0:
                has_support = False
                item_base_area = dim[0] * dim[2]
                supported_area = Decimal('0')

                for below in self.items:
                    if abs(below.position[1] + below.get_dimension()[1] - pivot[1]) < Decimal('0.1'):
                        ox = max(Decimal('0'), min(pivot[0] + dim[0], below.position[0] + below.get_dimension()[0]) - max(pivot[0], below.position[0]))
                        oz = max(Decimal('0'), min(pivot[2] + dim[2], below.position[2] + below.get_dimension()[2]) - max(pivot[2], below.position[2]))
                        supported_area += (ox * oz)

                if item_base_area > 0 and (supported_area / item_base_area) >= Decimal('0.65'):
                    has_support = True

                if not has_support:
                    continue

            # Valid placement!
            if self.get_total_weight() + item.weight > self.max_weight:
                return False
            self.items.append(item)
            return True

        item.position = valid_item_position
        return False

def pack_order(order_dict, squish_factor=0.0):
    packer = Packer()
    for i in range(1, 10):
        packer.add_bin(LinenBin(f"Red-Bag-{i}", RED_BAG["length"], RED_BAG["height"], RED_BAG["width"], RED_BAG["max_weight"]))

    for item_id, count in order_dict.items():
        spec = LINEN_CATALOG.get(item_id)
        if not spec:
            continue
        h = spec["h"] * (1 - squish_factor)
        for i in range(count):
            packer.add_item(LinenItem(
                item_id=item_id,
                name=f"{spec['name']} #{i+1}",
                length=spec["l"],
                height=h,
                width=spec["w"],
                weight=spec["weight"],
                color=spec["color"]
            ))

    packer.pack(bigger_first=True, distribute_items=False, number_of_decimals=2)

    packed_bags = []
    for b in packer.bins:
        if not b.items:
            continue
        bag_vol = RED_BAG["length"] * RED_BAG["width"] * RED_BAG["height"]
        packed_vol = sum(float(it.get_dimension()[0] * it.get_dimension()[1] * it.get_dimension()[2]) for it in b.items)
        max_h = max(float(it.position[1] + it.get_dimension()[1]) for it in b.items)
        packed_bags.append({
            "bagName": b.name,
            "itemCount": len(b.items),
            "maxHeightCm": round(max_h, 2),
            "volumeUtilizationPct": round((packed_vol / bag_vol) * 100, 1),
            "totalWeightKg": round(float(b.get_total_weight()), 2),
            "items": [
                {
                    "name": it.name,
                    "pos": [float(x) for x in it.position],
                    "size": [float(x) for x in it.get_dimension()],
                    "color": it.color
                }
                for it in b.items
            ]
        })

    return {
        "bagsRequired": len(packed_bags),
        "bags": packed_bags
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="3D Bin Packing for Red Bag Linens")
    parser.add_argument("--order", type=str, help="JSON order dictionary, e.g. '{\"pillow-cover\": 30, \"hand-towel\": 20}'")
    parser.add_argument("--squish", type=float, default=0.0, help="Squish / compression factor (0.0 to 0.15)")
    args = parser.parse_args()

    order = json.loads(args.order) if args.order else {
        "single-bed-sheet": 10,
        "hand-towel": 20,
        "pillow-cover": 40
    }

    res = pack_order(order, squish_factor=args.squish)
    print(json.dumps(res, indent=2))
