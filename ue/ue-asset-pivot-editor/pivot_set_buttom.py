import unreal


# 修改这里来选择目标 Pivot 位置：
# 0 = bottom
# 1 = center
# 2 = top
# 3 = left
# 4 = right
# 5 = back
# 6 = front
# 7 = world origin
TARGET_PIVOT_POSITION = 0

# True = 烘焙 Static Mesh 资源 Pivot 后，移动当前选中的 Actor 来保持它们在关卡里的视觉位置不变。
# 注意：Static Mesh 资源会影响所有引用它的实例；未选中的同资源 Actor 不会自动补偿位置。
COMPENSATE_SELECTED_ACTORS = True

# True = 保存被修改的 Static Mesh 资源。
SAVE_MODIFIED_ASSETS = True

PIVOT_POSITION_NAMES = {
    0: "bottom",
    1: "center",
    2: "top",
    3: "left",
    4: "right",
    5: "back",
    6: "front",
    7: "world origin",
}

def _get_selected_actors():
    """UE5 prefers EditorActorSubsystem; keep EditorLevelLibrary as fallback."""
    if hasattr(unreal, "EditorActorSubsystem"):
        subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        if subsystem and hasattr(subsystem, "get_selected_level_actors"):
            return list(subsystem.get_selected_level_actors())

    return list(unreal.EditorLevelLibrary.get_selected_level_actors())


def _set_selected_actors(actors):
    if hasattr(unreal, "EditorActorSubsystem"):
        subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        if subsystem and hasattr(subsystem, "set_selected_level_actors"):
            subsystem.set_selected_level_actors(actors)
            return

    unreal.EditorLevelLibrary.set_selected_level_actors(actors)


def _actor_label(actor):
    if hasattr(actor, "get_actor_label"):
        return actor.get_actor_label()
    return actor.get_name()


def _get_static_mesh_component(actor):
    if hasattr(actor, "static_mesh_component"):
        component = actor.static_mesh_component
        if component:
            return component

    if hasattr(actor, "get_component_by_class"):
        component = actor.get_component_by_class(unreal.StaticMeshComponent)
        if component:
            return component

    return None


def _get_actor_static_mesh(actor):
    component = _get_static_mesh_component(actor)
    if not component:
        return None

    if hasattr(component, "get_static_mesh"):
        return component.get_static_mesh()

    try:
        return component.get_editor_property("static_mesh")
    except Exception:
        return None


def _box_min_max(box):
    box_min = getattr(box, "min", None)
    box_max = getattr(box, "max", None)
    if box_min is not None and box_max is not None:
        return box_min, box_max

    box_min = getattr(box, "min_", None)
    box_max = getattr(box, "max_", None)
    if box_min is not None and box_max is not None:
        return box_min, box_max

    raise RuntimeError("无法读取 Static Mesh BoundingBox 的 min/max。")


def _vector_from_components(x, y, z):
    return unreal.Vector(float(x), float(y), float(z))


def _get_static_mesh_target_local_position(static_mesh, target_position):
    box_min, box_max = _box_min_max(static_mesh.get_bounding_box())
    center = _vector_from_components(
        (box_min.x + box_max.x) * 0.5,
        (box_min.y + box_max.y) * 0.5,
        (box_min.z + box_max.z) * 0.5,
    )

    if target_position == 0:
        return _vector_from_components(center.x, center.y, box_min.z)
    if target_position == 1:
        return center
    if target_position == 2:
        return _vector_from_components(center.x, center.y, box_max.z)
    if target_position == 3:
        return _vector_from_components(center.x, box_min.y, center.z)
    if target_position == 4:
        return _vector_from_components(center.x, box_max.y, center.z)
    if target_position == 5:
        return _vector_from_components(box_min.x, center.y, center.z)
    if target_position == 6:
        return _vector_from_components(box_max.x, center.y, center.z)
    if target_position == 7:
        return _vector_from_components(0.0, 0.0, 0.0)

    raise RuntimeError(f"未知 TARGET_PIVOT_POSITION: {target_position}")


def _make_id(id_class_name, index):
    id_class = getattr(unreal, id_class_name, None)
    if id_class:
        try:
            return id_class(index)
        except Exception:
            pass
    return index


def _translate_static_mesh_description(mesh_description, local_delta):
    if not hasattr(mesh_description, "get_vertex_count"):
        raise RuntimeError("当前 UE Python 的 MeshDescriptionBase 没有 get_vertex_count()，无法直接烘焙资源 Pivot。")

    vertex_count = mesh_description.get_vertex_count()
    moved_count = 0

    for index in range(vertex_count):
        vertex_id = _make_id("VertexID", index)
        try:
            position = mesh_description.get_vertex_position(vertex_id)
        except Exception:
            continue

        mesh_description.set_vertex_position(
            vertex_id,
            _vector_from_components(
                position.x + local_delta.x,
                position.y + local_delta.y,
                position.z + local_delta.z,
            ),
        )
        moved_count += 1

    if moved_count == 0:
        raise RuntimeError("没有成功移动任何顶点。")

    return moved_count


def _translate_static_mesh_sockets(static_mesh, local_delta):
    sockets = []
    try:
        sockets = list(static_mesh.get_editor_property("sockets") or [])
    except Exception:
        return 0

    moved_count = 0
    for socket in sockets:
        try:
            relative_location = socket.get_editor_property("relative_location")
            socket.set_editor_property(
                "relative_location",
                _vector_from_components(
                    relative_location.x + local_delta.x,
                    relative_location.y + local_delta.y,
                    relative_location.z + local_delta.z,
                ),
            )
            moved_count += 1
        except Exception as exc:
            unreal.log_warning(f"  [Socket Skip] {static_mesh.get_name()} 有一个 Socket 无法同步移动: {exc}")

    return moved_count


def _mark_asset_dirty(asset):
    try:
        asset.modify()
    except Exception:
        pass

    try:
        asset.mark_package_dirty()
    except Exception:
        pass


def _save_asset(asset):
    if not SAVE_MODIFIED_ASSETS:
        return

    try:
        unreal.EditorAssetLibrary.save_loaded_asset(asset)
    except Exception as exc:
        unreal.log_warning(f"  [Save Warning] {asset.get_name()} 保存失败，请手动保存资源: {exc}")


def _bake_static_mesh_asset_pivot(static_mesh, target_position):
    if not hasattr(static_mesh, "get_static_mesh_description"):
        raise RuntimeError("当前 UE Python 的 StaticMesh 没有 get_static_mesh_description()，无法直接编辑资源顶点。")

    target_local = _get_static_mesh_target_local_position(static_mesh, target_position)
    local_delta = _vector_from_components(-target_local.x, -target_local.y, -target_local.z)

    if abs(local_delta.x) < 0.0001 and abs(local_delta.y) < 0.0001 and abs(local_delta.z) < 0.0001:
        unreal.log(f"  [Asset Skip] {static_mesh.get_name()} 的 Pivot 已经在 {PIVOT_POSITION_NAMES[target_position]}。")
        return target_local, 0

    _mark_asset_dirty(static_mesh)

    lod_count = 1
    if hasattr(static_mesh, "get_num_lods"):
        lod_count = max(1, static_mesh.get_num_lods())

    descriptions = []
    moved_vertices = 0
    for lod_index in range(lod_count):
        mesh_description = static_mesh.get_static_mesh_description(lod_index)
        moved_vertices += _translate_static_mesh_description(mesh_description, local_delta)
        descriptions.append(mesh_description)

    if hasattr(static_mesh, "build_from_static_mesh_descriptions"):
        try:
            static_mesh.build_from_static_mesh_descriptions(descriptions, build_simple_collision=False, fast_build=False)
        except TypeError:
            static_mesh.build_from_static_mesh_descriptions(descriptions, build_simple_collision=False)

    moved_sockets = _translate_static_mesh_sockets(static_mesh, local_delta)

    try:
        static_mesh.post_edit_change()
    except Exception:
        pass

    _save_asset(static_mesh)
    unreal.log(
        f"  [Asset OK] {static_mesh.get_name()} -> Pivot {PIVOT_POSITION_NAMES[target_position]} "
        f"(moved vertices: {moved_vertices}, sockets: {moved_sockets}, local offset: {target_local})"
    )
    return target_local, moved_vertices


def _transform_local_vector(actor, local_vector):
    transform = actor.get_actor_transform()
    if hasattr(transform, "transform_vector"):
        return transform.transform_vector(local_vector)
    return transform.transform_position(local_vector) - transform.transform_position(unreal.Vector(0.0, 0.0, 0.0))


def _compensate_actor_location(actor, target_local):
    try:
        current_location = actor.get_actor_location()
        world_delta = _transform_local_vector(actor, target_local)
        actor.modify()
        actor.set_actor_location(
            _vector_from_components(
                current_location.x + world_delta.x,
                current_location.y + world_delta.y,
                current_location.z + world_delta.z,
            ),
            False,
            False,
        )
        return True
    except Exception as exc:
        unreal.log_warning(f"  [Compensate Fail] {_actor_label(actor)} 无法补偿位置: {exc}")
        return False


def run():
    if TARGET_PIVOT_POSITION not in PIVOT_POSITION_NAMES:
        unreal.log_error(f"TARGET_PIVOT_POSITION 必须是 0-7，现在是: {TARGET_PIVOT_POSITION}")
        return

    # 1. 获取在 Level 场景中选中的所有 Actor
    selected_actors = _get_selected_actors()
    if not selected_actors:
        unreal.log_warning("请先在场景中选中至少一个 Static Mesh Actor。")
        return

    success_count = 0
    compensated_count = 0
    total = len(selected_actors)
    target_name = PIVOT_POSITION_NAMES[TARGET_PIVOT_POSITION]
    baked_mesh_offsets = {}
    failed_meshes = set()

    unreal.log(f"开始批量烘焙 {total} 个选中 Actor 对应 Static Mesh 资源的 Pivot 到 {target_name}...")
    unreal.log_warning("注意：这是修改 Static Mesh 资源本身；同一个资源的未选中实例也会受影响。")

    # 3. 逐个处理，确保每个 Actor 都能独立居中到底部
    with unreal.ScopedSlowTask(total, "正在批量烘焙 Static Mesh Pivot...") as slow_task:
        slow_task.make_dialog(True)
        
        for actor in selected_actors:
            if slow_task.should_cancel():
                break
                
            slow_task.enter_progress_frame(1, f"处理: {_actor_label(actor)}")

            static_mesh = _get_actor_static_mesh(actor)
            if not static_mesh:
                unreal.log_warning(f"  [Skip] {_actor_label(actor)} 不是 Static Mesh Actor，或没有 Static Mesh 资源。")
                continue

            mesh_path = static_mesh.get_path_name()
            if mesh_path in failed_meshes:
                unreal.log_warning(f"  [Skip] {_actor_label(actor)} 使用的资源前面已经烘焙失败: {mesh_path}")
                continue

            if mesh_path not in baked_mesh_offsets:
                try:
                    target_local, moved_vertices = _bake_static_mesh_asset_pivot(static_mesh, TARGET_PIVOT_POSITION)
                    baked_mesh_offsets[mesh_path] = target_local
                    if moved_vertices > 0:
                        success_count += 1
                except Exception as exc:
                    failed_meshes.add(mesh_path)
                    unreal.log_error(f"  [Asset Fail] {static_mesh.get_name()} 烘焙资源 Pivot 失败: {exc}")
                    continue

            target_local = baked_mesh_offsets[mesh_path]
            if COMPENSATE_SELECTED_ACTORS and _compensate_actor_location(actor, target_local):
                compensated_count += 1
                success_count += 1
                continue

            if not COMPENSATE_SELECTED_ACTORS:
                success_count += 1

    # 4. 恢复最初的选择状态，方便用户继续操作
    _set_selected_actors(selected_actors)
    
    unreal.log("=" * 60)
    unreal.log(f"批量资源 Pivot 处理完成！已烘焙资源数: {len(baked_mesh_offsets) - len(failed_meshes)}，已补偿选中 Actor: {compensated_count} / {total}")
    unreal.log("=" * 60)

if __name__ == "__main__":
    run()
