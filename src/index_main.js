// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/All';

import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageReslice from '@kitware/vtk.js/Imaging/Core/ImageReslice';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkInteractorStyleImage from '@kitware/vtk.js/Interaction/Style/InteractorStyleImage';
import vtkResliceCursorWidget from '@kitware/vtk.js/Widgets/Widgets3D/ResliceCursorWidget';
import vtkWidgetManager from '@kitware/vtk.js/Widgets/Core/WidgetManager';

import {ViewTypes} from '@kitware/vtk.js/Widgets/Core/WidgetManager/Constants';
// Force the loading of HttpDataAccessHelper to support gzip decompression
import '@kitware/vtk.js/IO/Core/DataAccessHelper/HttpDataAccessHelper';
import vtkXMLImageDataReader from "@kitware/vtk.js/IO/XML/XMLImageDataReader";
import {radiansFromDegrees} from "@kitware/vtk.js/Common/Core/Math";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import myhanhJSON from './myhanh.json';
import vtkDataArray from "@kitware/vtk.js/Common/Core/DataArray";
import widgetBehavior from '@kitware/vtk.js/Widgets/Widgets3D/ResliceCursorWidget/cprBehavior';
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkImageCPRMapper from "@kitware/vtk.js/Rendering/Core/ImageCPRMapper";
import vtkPlaneManipulator from "@kitware/vtk.js/Widgets/Manipulators/PlaneManipulator";
import vtkCPRManipulator from '@kitware/vtk.js/Widgets/Manipulators/CPRManipulator';
import {mat3, mat4, vec3} from "gl-matrix";
import { updateState } from '@kitware/vtk.js/Widgets/Widgets3D/ResliceCursorWidget/helpers';


// ----------------------------------------------------------------------------
// Define main attributes
// ----------------------------------------------------------------------------

const reader = vtkXMLImageDataReader.newInstance({fetchGzip: true});
const widget = vtkResliceCursorWidget.newInstance();
window.widget = widget;

// ----------------------------------------------------------------------------
// Define html structure
// ----------------------------------------------------------------------------

const container = document.querySelector('body');
container.width = '100%';
container.height = '100%';

// ----------------------------------------------------------------------------
// Setup rendering code
// ----------------------------------------------------------------------------

const elementCpr = container;

const centerlineJson = myhanhJSON;

// Reslice Cursor Widget

const centerline = vtkPolyData.newInstance();
let currentImage = null;
const stretchPlane = 'Y';
const crossPlane = 'Z';

let cprContext;
function cpr(image) {

    const grw = vtkGenericRenderWindow.newInstance();
    grw.setContainer(elementCpr);
    grw.resize();
    const stretchRenderer = grw.getRenderer();
    // stretchRenderer.setBackground([0,0,0])
    const renderWindow = grw.getRenderWindow();

    const widget = vtkResliceCursorWidget.newInstance({
        planes: [stretchPlane, crossPlane],
        behavior: widgetBehavior,
    });
    const stretchViewType = ViewTypes.XZ_PLANE;
    const crossViewType = ViewTypes.XY_PLANE;
    const widgetState = widget.getWidgetState();

    renderWindow.setNumberOfLayers(2);

    const actor = vtkImageSlice.newInstance();
    const mapper = vtkImageCPRMapper.newInstance();
    mapper.setBackgroundColor(0, 0, 0, 0);
    actor.setMapper(mapper);

    mapper.setImageData(image);
    mapper.setCenterlineData(centerline);
    mapper.setWidth(0);

    const cprManipulator = vtkCPRManipulator.newInstance({
        cprActor: actor,
    });
    const planeManipulator = vtkPlaneManipulator.newInstance();

    const interactor = renderWindow.getInteractor();
    interactor.setInteractorStyle(vtkInteractorStyleImage.newInstance());
    interactor.setDesiredUpdateRate(15.0);

    return {
        widgetState: widgetState,
        stretchViewType: stretchViewType,
        crossViewType: crossViewType,
        cprManipulator: cprManipulator,
        mapper: mapper,
        widget: widget,
        actor: actor,
        planeManipulator: planeManipulator,
        stretchRenderer: stretchRenderer,
        interactor: interactor,
        renderWindow: renderWindow
        }
}

function updateDistanceAndDirection() {
    // Directions and position in world space from the widget
    const widgetPlanes = cprContext.widgetState.getPlanes();
    widgetPlanes[cprContext.stretchViewType].normal = [0, 0, 1]
    widgetPlanes[cprContext.stretchViewType].viewUp = [-1, 0, 0];
    const worldBitangent = widgetPlanes[cprContext.stretchViewType].normal;
    const worldNormal = widgetPlanes[cprContext.stretchViewType].viewUp;

    const worldTangent = vec3.cross([], worldBitangent, worldNormal);

    vec3.normalize(worldTangent, worldTangent);
    // console.log(worldBitangent, worldNormal, worldTangent, )
    const worldWidgetCenter = cprContext.widgetState.getCenter();
    const distance = cprContext.cprManipulator.getCurrentDistance();

    // CPR mapper tangent and bitangent directions update
    const { orientation } = cprContext.mapper.getCenterlinePositionAndOrientation(distance);
    // modelDirections * baseDirections = worldDirections
    // => baseDirections = modelDirections^(-1) * worldDirections
    const modelDirections = mat3.fromQuat([], orientation);
    const inverseModelDirections = mat3.invert([], modelDirections);
    const worldDirections = mat3.fromValues(
        ...worldBitangent,
        ...worldNormal,
        ...worldTangent,
    );
    const baseDirections = mat3.mul([], inverseModelDirections, worldDirections);
    // const baseDirections = worldDirections;
    cprContext.mapper.setDirectionMatrix(baseDirections);

    // Find the angle

    updateState(
        cprContext.widgetState,
        cprContext.widget.getScaleInPixels(),
        cprContext.widget.getRotationHandlePosition()
    );

    const width = cprContext.mapper.getWidth();
    const height = cprContext.mapper.getHeight();

    // CPR actor matrix update
    const worldActorTranslation = vec3.scaleAndAdd(
        [],
        worldWidgetCenter,
        worldTangent,
        -0.5 * width
    );
    vec3.scaleAndAdd(
        worldActorTranslation,
        worldActorTranslation,
        worldNormal,
        distance - height
    );
    const worldActorTransform = mat4.fromValues(
        ...worldTangent,
        0,
        ...worldNormal,
        0,
        ...vec3.scale([], worldBitangent, -1),
        0,
        ...worldActorTranslation,
        1
    );
    cprContext.actor.setUserMatrix(worldActorTransform);

    // CPR camera reset
    const stretchCamera = cprContext.stretchRenderer.getActiveCamera();
    const cameraDistance =
        (0.5 * height) /
        Math.tan(radiansFromDegrees(0.5 * stretchCamera.getViewAngle()));
    stretchCamera.setParallelScale(0.5 * height);
    stretchCamera.setParallelProjection(true);
    const cameraFocalPoint = vec3.scaleAndAdd(
        [],
        worldWidgetCenter,
        worldNormal,
        distance - 0.5 * height
    );
    const cameraPosition = vec3.scaleAndAdd(
        [],
        cameraFocalPoint,
        worldBitangent,
        -cameraDistance
    );
    stretchCamera.setPosition(...cameraPosition);
    stretchCamera.setFocalPoint(...cameraFocalPoint);
    stretchCamera.setViewUp(...worldNormal);
    cprContext.stretchRenderer.resetCameraClippingRange();
    // cprContext.interactor.render();

    cprContext.renderWindow.render();
}

function setCenterlineKey() {
    if (!currentImage) {
        return;
    }
    // Set positions of the centerline (model coordinates)
    const centerlinePoints = Float32Array.from(centerlineJson.position);
    const nPoints = centerlinePoints.length / 3;
    centerline.getPoints().setData(centerlinePoints, 3);

    // Set polylines of the centerline
    const centerlineLines = new Uint16Array(1 + nPoints);
    centerlineLines[0] = nPoints;
    for (let i = 0; i < nPoints; ++i) {
        centerlineLines[i + 1] = i;
    }
    centerline.getLines().setData(centerlineLines);

    // Create a rotated basis data array to oriented the CPR
    centerline.getPointData().setTensors(
        vtkDataArray.newInstance({
            name: 'Orientation',
            numberOfComponents: 16,
            values: Float32Array.from(centerlineJson.orientation),
        })
    );

    updateDistanceAndDirection();

}

// ----------------------------------------------------------------------------
// Load image
// ----------------------------------------------------------------------------
reader.setUrl(`myhanh.vti`).then(() => {
    reader.loadData().then(() => {
        const image = reader.getOutputData();
        cprContext = cpr(image);
        // widget.setImage(image);

        currentImage = image;

        cprContext.widget.setImage(image)
        const imageDimensions = image.getDimensions();
        const imageSpacing = image.getSpacing();
        console.log(image)
        // console.log("DIMENSION:",imageDimensions, imageSpacing)
        const diagonal = vec3.mul([], imageDimensions, imageSpacing);
        cprContext.mapper.setWidth(2 * vec3.len(diagonal));

        cprContext.actor.setUserMatrix(cprContext.widget.getResliceAxes(cprContext.stretchViewType));
        cprContext.stretchRenderer.addVolume(cprContext.actor);
        cprContext.widget.updateCameraPoints(cprContext.stretchRenderer, cprContext.stretchViewType, true, true);

        currentImage = image;
        setCenterlineKey();
    });
});
