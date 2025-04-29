import {
    __MIGRATABLE_TYPE,
    __MIGRATABLE_VERSION,
    deserialize,
    IUpgradeableTo,
    Registry,
    versionedSerializable,
    serialize,
    UnregisteredVersion,
    UnregisteredType,
} from './MigratableJsonDocument';

//#region EXAMPLE MIGRATABLE TYPE ===========================================

/**
 * This token will mark every version of serializable Widget.
 */
const WidgetTypeToken = Symbol.for('Widget');

//--------------------------------------------------------------------------
// V2
//--------------------------------------------------------------------------
type Color = 'red' | 'blue' | 'green';

interface FieldsOfV2 extends FieldsOfV1 {
    readonly shape: Shape;
    readonly color: Color;
}

// NOTE: The advantage of using a separate version number as an argument to this
// registration decorator (rather than the class name) is that the class can be
// renamed at will without affecting the behavior of previously serialized data.
@versionedSerializable(WidgetTypeToken, 2)
class WidgetV2 implements FieldsOfV2 {
    readonly shape: Shape;
    readonly color: Color;                                     // New in v2!

    constructor(state: FieldsOfV2) {
        // for (const key in state) this[key] = state[key];
        this.shape = state.shape;
        this.color = state.color;
    }

    static defaultValue(): WidgetV2 {
        return new WidgetV2({
            shape: 'rectangle',
            color: 'blue',
        });
    }

    // NOTE: upgrade() is not defined in most recent version
}

//--------------------------------------------------------------------------
// V1
//--------------------------------------------------------------------------
type Shape = 'circle' | 'triangle' | 'rectangle';

interface FieldsOfV1 {
    readonly shape: Shape;
}

@versionedSerializable(WidgetTypeToken, 1)
class WidgetV1 implements FieldsOfV1, IUpgradeableTo<WidgetV2> {
    readonly shape: Shape;

    constructor(state: FieldsOfV1) {
        this.shape = state.shape;
    }

    static defaultValue(): WidgetV1 {
        return new WidgetV1({ shape: 'triangle' });
    }

    upgrade() {
        return new WidgetV2({
            ...this,
            color: 'red',
        });
    }
}

//--------------------------------------------------------------------------
const Widget = WidgetV2;     // CHANGE THIS EVERY TIME A NEW VERSION IS CREATED
type WidgetType = WidgetV2;  // CHANGE THIS EVERY TIME A NEW VERSION IS CREATED

/**
 * Deserializer always produces the latest version of Widget, even when an
 * older serialized version is supplied.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fromJSON = deserialize<WidgetType>(Widget.defaultValue);

/** Serializer always produces latest version of Widget */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const toJSON = serialize<WidgetType>(Widget);

//#endregion EXAMPLE MIGRATABLE TYPE ========================================

test('register', () => {
    // Arrange
    const registry = new Registry();
    const expectedTypeToken = Symbol.for(Math.random().toString());
    const expectedVersion = 1;

    // Act
    @registry.decorate(expectedTypeToken, expectedVersion)
    class Whatzit {
        constructor() {}
    }

    // Assert
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actualTypeToken = (Whatzit as any)['__migratable_type']; // added by @registry.decorate()
    if (undefined === actualTypeToken) {
        throw new Error(`${actualTypeToken} constructor is missing __migratable_type property`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actualVersion = (Whatzit as any)['__migratable_version']; // added by @registry.decorate()
    if (undefined === actualVersion) {
        throw new Error(`${actualTypeToken} constructor is missing __migratable_version property`);
    }
});

describe('deserialize', () => {
    it('when NO upgrade is required', () => {
        // Arrange
        const registry = new Registry();
        registry.register(WidgetTypeToken, 1, WidgetV1);
        registry.register(WidgetTypeToken, 2, WidgetV2);
        const serialized = {
            [__MIGRATABLE_TYPE]: WidgetTypeToken.description,
            [__MIGRATABLE_VERSION]: 2,
            shape: 'circle',
            color: 'blue',
        };

        // Act
        const actual = registry.deserialize<WidgetV2>(WidgetV2.defaultValue)(serialized);

        // Assert
        expect(actual).toStrictEqual(new WidgetV2({
            shape: 'circle',
            color: 'blue',
        }));
    });

    it('when an upgrade is required', () => {
        // Arrange
        const registry = new Registry();
        registry.register(WidgetTypeToken, 1, WidgetV1);
        registry.register(WidgetTypeToken, 2, WidgetV2);
        const serialized = {
            [__MIGRATABLE_TYPE]: WidgetTypeToken.description,
            [__MIGRATABLE_VERSION]: 1,
            shape: 'circle',
        };

        // Act
        const actual = registry.deserialize<WidgetV2>(WidgetV2.defaultValue)(serialized);

        // Assert
        expect(actual).toStrictEqual(new WidgetV2({
            shape: 'circle',
            color: 'red',
        }));
    });

    it.each([null, undefined])('when serialized value is %p', (value) => {
        // Arrange
        const registry = new Registry();
        registry.register(WidgetTypeToken, 1, WidgetV1);
        registry.register(WidgetTypeToken, 2, WidgetV2);

        // Act
        const actual = registry.deserialize<WidgetV2>(WidgetV2.defaultValue)(value);

        // Assert
        expect(actual).toStrictEqual(WidgetV2.defaultValue());
    });

    it('when the type is not registered', () => {
        // Arrange
        const registry = new Registry();
        // registry.register(WidgetTypeToken, 1, WidgetV1); // SKIP REGISTRATION
        // registry.register(WidgetTypeToken, 2, WidgetV2);
        const serialized = {
            [__MIGRATABLE_TYPE]: WidgetTypeToken.description,
            [__MIGRATABLE_VERSION]: 2,
            shape: 'circle',
            color: 'blue',
        };

        // Act & Assert
        expect(() => {
            registry.deserialize<WidgetV2>(WidgetV2.defaultValue)(serialized);
        }).toThrow(UnregisteredType);
    });

    it('when the version is not registered', () => {
        // Arrange
        const registry = new Registry();
        registry.register(WidgetTypeToken, 1, WidgetV1);
        registry.register(WidgetTypeToken, 2, WidgetV2);
        const serialized = {
            [__MIGRATABLE_TYPE]: WidgetTypeToken.description,
            [__MIGRATABLE_VERSION]: 3, // NOTICE: unregistered version
            shape: 'circle',
            color: 'blue',
            texture: 'grainy',
        };

        // Act & Assert
        expect(() => {
            registry.deserialize<WidgetV2>(WidgetV2.defaultValue)(serialized);
        }).toThrow(UnregisteredVersion);
    });
});

describe('serialize', () => {
    it('when only one version is registered', () => {
        // Arrange
        const registry = new Registry();
        registry.register(WidgetTypeToken, 2, WidgetV2);

        // Act
        const actual = registry.serialize(WidgetV2)(new WidgetV2({
            shape: 'circle',
            color: 'blue',
        }));

        // Assert
        expect(actual).toBe(JSON.stringify({
            shape: 'circle',
            color: 'blue',
            [__MIGRATABLE_TYPE]: WidgetTypeToken.description,
            [__MIGRATABLE_VERSION]: 2,
        }));
    });

    it('when multiple versions are registered', () => {
        // Arrange
        const registry = new Registry();
        registry.register(WidgetTypeToken, 2, WidgetV2);
        registry.register(WidgetTypeToken, 1, WidgetV1);

        // Act
        const actual = registry.serialize(WidgetV2)(new WidgetV2({
            shape: 'circle',
            color: 'blue',
        }));

        // Assert
        expect(actual).toBe(JSON.stringify({
            shape: 'circle',
            color: 'blue',
            [__MIGRATABLE_TYPE]: WidgetTypeToken.description,
            [__MIGRATABLE_VERSION]: 2,
        }));
    });
});
