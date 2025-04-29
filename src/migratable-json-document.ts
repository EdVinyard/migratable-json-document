export interface IUpgradeableTo<TUpgraded> {
    upgrade(): TUpgraded;
}

/**
 * EXPORTED FOR UNIT TESTING; marker attribute applied to constructor functions
 */
export const __MIGRATABLE_TYPE = '__migratable_type';

/**
 * EXPORTED FOR UNIT TESTING; marker attribute applied to constructor functions
 */
export const __MIGRATABLE_VERSION = '__migratable_version';

/**
 * the serialized form of a serializable, versioned class instance
 */
type Serialized = Record<string, unknown> & {
    [__MIGRATABLE_TYPE]: string,
    [__MIGRATABLE_VERSION]: number,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConstructorFn<T> = new(...args: any[]) => T;

/**
 * Registering a type via `@serializableVersionedClass(type, version)` will
 * stash a little extra information as properties on the constructor
 * function-object.
 */
type RegisteredConstructor<T> = ConstructorFn<T> & {
    [__MIGRATABLE_TYPE]: symbol,
    [__MIGRATABLE_VERSION]: number,
};

//#region error types

export class MigratableTypeError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export class UnregisteredType extends MigratableTypeError {
    constructor(typeName: string) {
        super(`no classes registered for type ${typeName}`);
    }
}

export class UnregisteredVersion extends MigratableTypeError {
    constructor(typeName: string, version: number) {
        super(`no classes registered for type ${typeName} version ${version}`);
    }
}

export class RegistrationConflict extends MigratableTypeError {
    constructor(typeToken: symbol, version: number) {
        super(`conflicting registration for ${typeToken.description} version ${version}`);
    }
}

export class InvariantViolation extends MigratableTypeError {
    constructor(message: string) {
        super(message);
    }
}

//#endregion error types

/**
 * EXPORTED FOR UNIT TESTING.  Use `@serializableVersionedClass(type, version)`
 * `deserialize<T>(default)`, and `serialize(T)` instead.
 */
export class Registry {
    /**
     * maps serializable-class-symbol to version number to constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    private readonly byTypeToken = new Map<symbol, Map<number, Function>>();

    /**
     * decorates a class declaration to indicate that the class is among a
     * sequence of related, serializable classes that represent different
     * versions of the same persistable information
     */
    decorate(symbol: symbol, version: number) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        return (constructor: Function): void => {
            this.register(symbol, version, constructor);
        }
    }

    /**
     * Prefer the class decorator `Registry.decorate()`.
     */
    register(type: symbol, version: number, constructor: unknown): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const constructorAsAny = (constructor as any);

        let byVersion = this.byTypeToken.get(type);
        if (undefined === byVersion) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            byVersion = new Map<number, Function>()
            this.byTypeToken.set(type, byVersion);
        }

        const knownConstructor = byVersion.get(version);
        if (undefined === knownConstructor) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            byVersion.set(version, (...args: any[]) => new constructorAsAny(...args));
        } else if (knownConstructor !== constructor) {
            throw new RegistrationConflict(type, version);
        }

        constructorAsAny[__MIGRATABLE_TYPE] = type;
        constructorAsAny[__MIGRATABLE_VERSION] = version;
        // console.log(`Registered migratable JSON document type ${type.toString()} version ${version}.`)
    }

    /**
     * Create a deserializer function for migratable type T, with a default
     * value to be used when the serialized form is `null` or `undefined`.
     *
     * @param valueOnNullOrUndefined when the value supplied to the resulting
     * deserializer is `null` or `undefined`, the value returned by this
     * function is returned
     * @returns a function that produces instances of T from serialized
     * migratable type instances
     */
    deserialize<T>(
        valueOnNullOrUndefined: () => T,
    ) {
        return (json: string | object | null | undefined): T => {
            if (json === null || json === undefined) {
                return valueOnNullOrUndefined();
            }

            const serialized: Serialized = (typeof json === 'string')
                ? JSON.parse(json)
                : json;
            const { __migratable_type, __migratable_version, ...constructorArg } = serialized;
            const typeSymbol = Symbol.for(__migratable_type);

            const byVersion = this.byTypeToken.get(typeSymbol);
            if (undefined === byVersion) {
                throw new UnregisteredType(__migratable_type);
            }

            const versionSpecificDeserializer = byVersion.get(__migratable_version);
            if (undefined === versionSpecificDeserializer) {
                throw new UnregisteredVersion(__migratable_type, __migratable_version);
            }

            let deserialized = versionSpecificDeserializer(constructorArg);
            while ('upgrade' in deserialized) {
                deserialized = deserialized.upgrade();
            }

            // console.log(JSON.stringify(deserialized, null, 4));

            return deserialized as T;
        };
    }

    serialize<T>(constructorFn: ConstructorFn<T>) {
        const { type, version } = this.registrationOf(constructorFn);

        return (instance: T): string => {
            return JSON.stringify({
                ...instance,
                [__MIGRATABLE_TYPE]: type.description,
                [__MIGRATABLE_VERSION]: version,
            });
        }
    }

    registrationOf<T>(
        constructorFn: ConstructorFn<T>,
    ): { type: symbol, version: number } {
        const registeredConstructor = constructorFn as RegisteredConstructor<T>;
        const type = registeredConstructor[__MIGRATABLE_TYPE];
        const typeName: string = type.description ?? type.toString();
        if (undefined === type) {
            throw new InvariantViolation(`${typeName} constructor is missing __migratable_type property`);
        }

        const version = registeredConstructor[__MIGRATABLE_VERSION];
        if (undefined === version) {
            throw new InvariantViolation(`${typeName} constructor is missing __migratable_version property`);
        }

        const allVersions = this.byTypeToken.get(type);
        if (undefined === allVersions) {
            throw new InvariantViolation(`nothing registered for type ${typeName}`);
        }

        if (undefined === allVersions.get(version)) {
            throw new InvariantViolation(`nothing registered for type ${typeName} version ${version}`);
        }

        return { type, version };
    }

    /**
     * For testing and debugging, print information about all registered types
     * and versions.
     */
    dump() {
        for (const [typeToken, byVersion] of this.byTypeToken.entries()) {
            for (const [version, constr] of byVersion.entries()) {
                console.log(`${typeToken.toString()} ${version} ${constr.name}`);
            }
        }
    }
}

const global = new Registry();

export const versionedSerializable = global.decorate.bind(global);
export const deserialize = global.deserialize.bind(global);
export const serialize = global.serialize.bind(global);
