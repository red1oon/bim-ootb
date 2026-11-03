// This library provides WebAssembly bindings for the FreeCAD's geometric solver library planegcs.
// Copyright (C) 2023  Miroslav Šerý, Salusoft89 <miroslav.sery@salusoft89.cz>  
export class GcsSystemMock {
    params_size() {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    get_p_param(i) {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    set_p_param(i, value, fixed) {
        return;
    }
    push_p_param(value, fixed) {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    get_is_fixed(i) {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    set_max_iterations(n) {
        return;
    }
    get_max_iterations() {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    set_covergence_threshold(threshold) {
        return;
    }
    get_convergence_threshold() {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    solve_system(algorithm) {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    get_p_params() {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    clear_data() {
        return;
    }
    apply_solution() {
        return;
    }
    dof() {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    has_conflicting() {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    has_redundant() {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    has_partially_redundant() {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    get_conflicting() {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    get_redundant() {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    get_partially_redundant() {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    clear_by_id(id) {
        return;
    }
    set_debug_mode(debug_mode) {
        return;
    }
    get_debug_mode() {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    make_point(px_i, py_i) {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    make_line(p1x_i, p1y_i, p2x_i, p2y_i) {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    make_circle(cx_i, cy_i, rad_i) {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    make_ellipse(cx_i, cy_i, focus1x_i, focus1y_i, radmin_i) {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    make_hyperbola(cx_i, cy_i, focus1x_i, focus1y_i, radmin_i) {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    make_parabola(vertexx_i, vertexy_i, focus1x_i, focus1y_i) {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    make_arc(cx_i, cy_i, startx_i, starty_i, endx_i, endy_i, startangle_i, endangle_i, rad_i) {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    make_arc_of_ellipse(cx_i, cy_i, focus1x_i, focus1y_i, startx_i, starty_i, endx_i, endy_i, startangle_i, endangle_i, radmin_i) {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    make_arc_of_parabola(vertexx_i, vertexy_i, focusx_i, focusy_i, startx_i, starty_i, endx_i, endy_i, startangle_i, endangle_i) {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    make_arc_of_hyperbola(cx_i, cy_i, focus1x_i, focus1y_i, startx_i, starty_i, endx_i, endy_i, startangle_i, endangle_i, radmin_i) {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    make_bspline(startx_i, starty_i, endx_i, endy_i, poles_xy_i, weights_i, knots_i, mult, degree, periodic) {
        // @ts-expect-error: return in mock can be undefined
        return undefined;
    }
    add_constraint_equal(param1_param_i, param2_param_i, tagId, driving, internalalignment, scale) {
        return;
    }
    add_constraint_proportional(param1_param_i, param2_param_i, ratio, tagId, driving, scale) {
        return;
    }
    add_constraint_difference(param1_param_i, param2_param_i, difference_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_p2p_distance(p1, p2, distance_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_p2p_angle_incr_angle(p1, p2, angle_param_i, incrAngle, tagId, driving, scale) {
        return;
    }
    add_constraint_p2p_angle(p1, p2, angle_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_p2l_distance(p, l, distance_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_point_on_line_pl(p, l, tagId, driving, scale) {
        return;
    }
    add_constraint_point_on_line_ppp(p, lp1, lp2, tagId, driving, scale) {
        return;
    }
    add_constraint_point_on_perp_bisector_pl(p, l, tagId, driving, scale) {
        return;
    }
    add_constraint_point_on_perp_bisector_ppp(p, lp1, lp2, tagId, driving, scale) {
        return;
    }
    add_constraint_parallel(l1, l2, tagId, driving, scale) {
        return;
    }
    add_constraint_perpendicular_ll(l1, l2, tagId, driving, scale) {
        return;
    }
    add_constraint_perpendicular_pppp(l1p1, l1p2, l2p1, l2p2, tagId, driving, scale) {
        return;
    }
    add_constraint_l2l_angle_ll(l1, l2, angle_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_l2l_angle_pppp(l1p1, l1p2, l2p1, l2p2, angle_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_angle_via_point(crv1, crv2, p, angle_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_angle_via_two_points(crv1, crv2, p1, p2, angle_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_angle_via_point_and_param(crv1, crv2, p, cparam_param_i, angle_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_angle_via_point_and_two_params(crv1, crv2, p, cparam1_param_i, cparam2_param_i, angle_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_midpoint_on_line_ll(l1, l2, tagId, driving, scale) {
        return;
    }
    add_constraint_midpoint_on_line_pppp(l1p1, l1p2, l2p1, l2p2, tagId, driving, scale) {
        return;
    }
    add_constraint_tangent_circumf(p1, p2, rd1_param_i, rd2_param_i, internal, tagId, driving, scale) {
        return;
    }
    add_constraint_tangent_at_bspline_knot(b, l, knotindex, tagId, driving, scale) {
        return;
    }
    add_constraint_p2p_coincident(p1, p2, tagId, driving, scale) {
        return;
    }
    add_constraint_horizontal_l(l, tagId, driving, scale) {
        return;
    }
    add_constraint_horizontal_pp(p1, p2, tagId, driving, scale) {
        return;
    }
    add_constraint_vertical_l(l, tagId, driving, scale) {
        return;
    }
    add_constraint_vertical_pp(p1, p2, tagId, driving, scale) {
        return;
    }
    add_constraint_coordinate_x(p, x_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_coordinate_y(p, y_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_arc_rules(a, tagId, driving, scale) {
        return;
    }
    add_constraint_point_on_circle(p, c, tagId, driving, scale) {
        return;
    }
    add_constraint_point_on_ellipse(p, e, tagId, driving, scale) {
        return;
    }
    add_constraint_point_on_hyperbolic_arc(p, e, tagId, driving, scale) {
        return;
    }
    add_constraint_point_on_parabolic_arc(p, e, tagId, driving, scale) {
        return;
    }
    add_constraint_point_on_bspline(p, b, pointparam_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_arc_of_ellipse_rules(a, tagId, driving, scale) {
        return;
    }
    add_constraint_curve_value(p, a, u_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_arc_of_hyperbola_rules(a, tagId, driving, scale) {
        return;
    }
    add_constraint_arc_of_parabola_rules(a, tagId, driving, scale) {
        return;
    }
    add_constraint_point_on_arc(p, a, tagId, driving, scale) {
        return;
    }
    add_constraint_perpendicular_line2arc(p1, p2, a, tagId, driving, scale) {
        return;
    }
    add_constraint_perpendicular_arc2line(a, p1, p2, tagId, driving, scale) {
        return;
    }
    add_constraint_perpendicular_circle2arc(center, radius_param_i, a, tagId, driving, scale) {
        return;
    }
    add_constraint_perpendicular_arc2circle(a, center, radius_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_perpendicular_arc2arc(a1, reverse1, a2, reverse2, tagId, driving, scale) {
        return;
    }
    add_constraint_tangent_lc(l, c, tagId, driving, scale) {
        return;
    }
    add_constraint_tangent_le(l, e, tagId, driving, scale) {
        return;
    }
    add_constraint_tangent_la(l, a, tagId, driving, scale) {
        return;
    }
    add_constraint_tangent_cc(c1, c2, tagId, driving, scale) {
        return;
    }
    add_constraint_tangent_aa(a1, a2, tagId, driving, scale) {
        return;
    }
    add_constraint_tangent_ca(c, a, tagId, driving, scale) {
        return;
    }
    add_constraint_circle_radius(c, radius_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_arc_radius(a, radius_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_circle_diameter(c, diameter_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_arc_diameter(a, diameter_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_equal_length(l1, l2, tagId, driving, scale) {
        return;
    }
    add_constraint_equal_radius_cc(c1, c2, tagId, driving, scale) {
        return;
    }
    add_constraint_equal_radii_ee(e1, e2, tagId, driving, scale) {
        return;
    }
    add_constraint_equal_radii_ahah(a1, a2, tagId, driving, scale) {
        return;
    }
    add_constraint_equal_radius_ca(c1, a2, tagId, driving, scale) {
        return;
    }
    add_constraint_equal_radius_aa(a1, a2, tagId, driving, scale) {
        return;
    }
    add_constraint_equal_focus(a1, a2, tagId, driving, scale) {
        return;
    }
    add_constraint_p2p_symmetric_ppl(p1, p2, l, tagId, driving, scale) {
        return;
    }
    add_constraint_p2p_symmetric_ppp(p1, p2, p, tagId, driving, scale) {
        return;
    }
    add_constraint_snells_law(ray1, ray2, boundary, p, n1_param_i, n2_param_i, flipn1, flipn2, tagId, driving, scale) {
        return;
    }
    add_constraint_c2cdistance(c1, c2, dist_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_c2ldistance(c, l, dist_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_p2cdistance(p, c, distance_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_arc_length(a, dist_param_i, tagId, driving, scale) {
        return;
    }
    add_constraint_internal_alignment_point2ellipse(e, p1, alignmentType, tagId, driving, scale) {
        return;
    }
    add_constraint_internal_alignment_ellipse_major_diameter(e, p1, p2, tagId, driving, scale) {
        return;
    }
    add_constraint_internal_alignment_ellipse_minor_diameter(e, p1, p2, tagId, driving, scale) {
        return;
    }
    add_constraint_internal_alignment_ellipse_focus1(e, p1, tagId, driving, scale) {
        return;
    }
    add_constraint_internal_alignment_ellipse_focus2(e, p1, tagId, driving, scale) {
        return;
    }
    add_constraint_internal_alignment_point2hyperbola(e, p1, alignmentType, tagId, driving, scale) {
        return;
    }
    add_constraint_internal_alignment_hyperbola_major_diameter(e, p1, p2, tagId, driving, scale) {
        return;
    }
    add_constraint_internal_alignment_hyperbola_minor_diameter(e, p1, p2, tagId, driving, scale) {
        return;
    }
    add_constraint_internal_alignment_hyperbola_focus(e, p1, tagId, driving, scale) {
        return;
    }
    add_constraint_internal_alignment_parabola_focus(e, p1, tagId, driving, scale) {
        return;
    }
    add_constraint_internal_alignment_bspline_control_point(b, c, poleindex, tag, driving, scale) {
        return;
    }
    add_constraint_internal_alignment_knot_point(b, p, knotindex, tagId, driving, scale) {
        return;
    }
    delete() {
        return;
    }
}
//# sourceMappingURL=gcs_system_mock.js.map